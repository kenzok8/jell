#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <glob.h>
#include <limits.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <syslog.h>
#include <time.h>
#include <unistd.h>

#define PROGRAM_NAME "fancontrol"
#define PROGRAM_VERSION "2.0.0"
#define AUTO_VALUE "auto"
#define DEFAULT_SYSFS_ROOT "/sys"
#define DEFAULT_STATUS_FILE "/var/run/fancontrol.status"
#define MAX_HWMON_CHANNELS 32

struct fan_config {
	char thermal_file[PATH_MAX];
	char thermal_zone[128];
	char fan_file[PATH_MAX];
	char fan_hwmon[128];
	char enable_file[PATH_MAX];
	int start_temp;
	int full_speed_temp;
	int hysteresis;
	int start_pwm;
	int max_pwm;
	int kick_pwm;
	int kick_ms;
	int fail_safe_pwm;
	int exit_pwm;
	int temp_div;
	int interval;
	bool debug;
	bool once;
};

struct fan_runtime {
	char thermal_file[PATH_MAX];
	char fan_file[PATH_MAX];
	char enable_file[PATH_MAX];
	char rpm_file[PATH_MAX];
	bool fan_active;
};

static const char *sysfs_root = DEFAULT_SYSFS_ROOT;
static const char *status_file = DEFAULT_STATUS_FILE;
static volatile sig_atomic_t stop_requested;

static void usage(FILE *stream, const char *name)
{
	fprintf(stream,
		"Usage: %s [options]\n"
		"  -T path       temperature sysfs path or 'auto'\n"
		"  -Z type       preferred thermal zone type or 'auto'\n"
		"  -F path       PWM sysfs path or 'auto'\n"
		"  -N name       preferred hwmon name or 'auto'\n"
		"  -E path       pwm enable sysfs path or 'auto'\n"
		"  -t degrees    fan start temperature\n"
		"  -x degrees    full-speed temperature\n"
		"  -H degrees    stop hysteresis\n"
		"  -s pwm        minimum running PWM (1-255)\n"
		"  -m pwm        maximum PWM (1-255)\n"
		"  -k pwm        start kick PWM, 0 disables the kick\n"
		"  -K ms         start kick duration in milliseconds\n"
		"  -f pwm        PWM used after a sensor failure\n"
		"  -q pwm        PWM used when the daemon exits\n"
		"  -d divisor    temperature input divisor\n"
		"  -i seconds    polling interval\n"
		"  -D            enable debug logging\n"
		"  -1            run one control cycle and exit\n"
		"  -v            print version\n"
		"  -h            show this help\n",
		name);
}

static int copy_string(char *dest, size_t size, const char *source)
{
	int len;

	if (!source || strpbrk(source, "\r\n"))
		return -1;

	len = snprintf(dest, size, "%s", source);
	return len < 0 || (size_t)len >= size ? -1 : 0;
}

static bool is_auto(const char *value)
{
	return !value[0] || strcmp(value, AUTO_VALUE) == 0;
}

static int parse_int(const char *text, int min, int max, const char *name)
{
	char *end = NULL;
	long value;

	errno = 0;
	value = strtol(text, &end, 10);
	if (errno || !end || *end || value < min || value > max) {
		fprintf(stderr, "Invalid %s: %s\n", name, text);
		exit(EXIT_FAILURE);
	}

	return (int)value;
}

static int read_text_file(const char *path, char *buffer, size_t size)
{
	ssize_t length;
	int fd;

	if (!size)
		return -1;

	fd = open(path, O_RDONLY | O_CLOEXEC);
	if (fd < 0)
		return -1;

	length = read(fd, buffer, size - 1);
	close(fd);
	if (length <= 0)
		return -1;

	buffer[length] = '\0';
	buffer[strcspn(buffer, "\r\n")] = '\0';
	return 0;
}

static int read_long_file(const char *path, long *value)
{
	char buffer[64];
	char *end = NULL;
	long parsed;

	if (read_text_file(path, buffer, sizeof(buffer)))
		return -1;

	errno = 0;
	parsed = strtol(buffer, &end, 10);
	if (errno || end == buffer)
		return -1;

	while (*end == ' ' || *end == '\t')
		end++;
	if (*end)
		return -1;

	*value = parsed;
	return 0;
}

static int write_long_file(const char *path, int value)
{
	char buffer[32];
	ssize_t written;
	int length;
	int fd;

	length = snprintf(buffer, sizeof(buffer), "%d\n", value);
	if (length < 0 || (size_t)length >= sizeof(buffer))
		return -1;

	fd = open(path, O_WRONLY | O_CLOEXEC);
	if (fd < 0)
		return -1;

	written = write(fd, buffer, (size_t)length);
	if (close(fd) || written != length)
		return -1;

	return 0;
}

static void sleep_ms(unsigned int milliseconds)
{
	struct timespec remaining = {
		.tv_sec = milliseconds / 1000,
		.tv_nsec = (long)(milliseconds % 1000) * 1000000L,
	};

	while (!stop_requested && nanosleep(&remaining, &remaining) && errno == EINTR)
		;
}

static int preferred_thermal_score(const char *type)
{
	static const char * const preferred[] = {
		"cpu-top-thermal", "cpu_top_thermal", "cpu-thermal",
		"cpu_thermal", "soc-thermal", "soc_thermal",
	};
	size_t i;

	for (i = 0; i < sizeof(preferred) / sizeof(preferred[0]); i++)
		if (strcmp(type, preferred[i]) == 0)
			return (int)i;

	return 100;
}

static int preferred_hwmon_temp_score(const char *name)
{
	if (strstr(name, "cpu") || strstr(name, "CPU"))
		return 0;
	if (strstr(name, "soc") || strstr(name, "SoC"))
		return 1;

	return 100;
}

static int discover_hwmon_temperature(char *result, size_t result_size)
{
	char pattern[PATH_MAX];
	char name_file[PATH_MAX];
	char hwmon_name[128];
	char candidate[PATH_MAX];
	char best[PATH_MAX] = "";
	glob_t paths = { 0 };
	int best_score = INT_MAX;
	size_t i;

	if (snprintf(pattern, sizeof(pattern), "%s/class/hwmon/hwmon*", sysfs_root) >=
	    (int)sizeof(pattern))
		return -1;
	if (glob(pattern, 0, NULL, &paths))
		return -1;

	for (i = 0; i < paths.gl_pathc; i++) {
		int channel;
		int score;

		if (snprintf(name_file, sizeof(name_file), "%s/name", paths.gl_pathv[i]) >=
		    (int)sizeof(name_file) ||
		    read_text_file(name_file, hwmon_name, sizeof(hwmon_name)))
			hwmon_name[0] = '\0';
		score = preferred_hwmon_temp_score(hwmon_name);

		for (channel = 1; channel <= MAX_HWMON_CHANNELS; channel++) {
			if (snprintf(candidate, sizeof(candidate), "%s/temp%d_input",
				     paths.gl_pathv[i], channel) >= (int)sizeof(candidate))
				continue;
			if (access(candidate, R_OK))
				continue;
			if (score < best_score) {
				copy_string(best, sizeof(best), candidate);
				best_score = score;
			}
			break;
		}
	}

	globfree(&paths);
	if (!best[0])
		return -1;

	return copy_string(result, result_size, best);
}

static int discover_thermal_file(const struct fan_config *config,
				 char *result, size_t result_size)
{
	char pattern[PATH_MAX];
	char type_file[PATH_MAX];
	char type[128];
	char best[PATH_MAX] = "";
	glob_t paths = { 0 };
	int best_score = INT_MAX;
	size_t i;

	if (snprintf(pattern, sizeof(pattern), "%s/class/thermal/thermal_zone*/temp",
		     sysfs_root) >= (int)sizeof(pattern))
		return -1;

	if (glob(pattern, 0, NULL, &paths)) {
		if (is_auto(config->thermal_zone))
			return discover_hwmon_temperature(result, result_size);
		return -1;
	}

	for (i = 0; i < paths.gl_pathc; i++) {
		char *slash;
		int score;

		if (access(paths.gl_pathv[i], R_OK))
			continue;

		if (copy_string(type_file, sizeof(type_file), paths.gl_pathv[i]))
			continue;
		slash = strrchr(type_file, '/');
		if (!slash)
			continue;
		copy_string(slash + 1, sizeof(type_file) - (size_t)(slash + 1 - type_file),
			    "type");
		if (read_text_file(type_file, type, sizeof(type)))
			type[0] = '\0';

		if (!is_auto(config->thermal_zone)) {
			if (strcmp(config->thermal_zone, type) != 0)
				continue;
			score = 0;
		} else {
			score = preferred_thermal_score(type);
		}

		if (score < best_score) {
			copy_string(best, sizeof(best), paths.gl_pathv[i]);
			best_score = score;
		}
	}

	globfree(&paths);
	if (!best[0]) {
		if (is_auto(config->thermal_zone))
			return discover_hwmon_temperature(result, result_size);
		return -1;
	}

	return copy_string(result, result_size, best);
}

static bool valid_pwm_basename(const char *name, int *channel)
{
	char trailing;
	int parsed;

	if (sscanf(name, "pwm%d%c", &parsed, &trailing) != 1 ||
	    parsed < 1 || parsed > MAX_HWMON_CHANNELS)
		return false;

	*channel = parsed;
	return true;
}

static int derive_fan_paths(const char *pwm_file, struct fan_runtime *runtime)
{
	char directory[PATH_MAX];
	const char *basename;
	char *slash;
	int channel;
	int length;

	if (copy_string(directory, sizeof(directory), pwm_file))
		return -1;
	slash = strrchr(directory, '/');
	if (!slash)
		return -1;
	basename = slash + 1;
	if (!valid_pwm_basename(basename, &channel))
		return 0;
	*slash = '\0';

	if (is_auto(runtime->enable_file)) {
		length = snprintf(runtime->enable_file, sizeof(runtime->enable_file),
				  "%s/pwm%d_enable", directory, channel);
		if (length < 0 || (size_t)length >= sizeof(runtime->enable_file))
			return -1;
		if (access(runtime->enable_file, W_OK))
			runtime->enable_file[0] = '\0';
	}

	length = snprintf(runtime->rpm_file, sizeof(runtime->rpm_file),
			  "%s/fan%d_input", directory, channel);
	if (length < 0 || (size_t)length >= sizeof(runtime->rpm_file))
		return -1;
	if (access(runtime->rpm_file, R_OK))
		runtime->rpm_file[0] = '\0';

	return 0;
}

static int discover_fan_file(const struct fan_config *config,
			     struct fan_runtime *runtime)
{
	char pattern[PATH_MAX];
	char name_file[PATH_MAX];
	char hwmon_name[128];
	char candidate[PATH_MAX];
	char best[PATH_MAX] = "";
	glob_t paths = { 0 };
	int best_score = INT_MAX;
	size_t i;

	if (snprintf(pattern, sizeof(pattern), "%s/class/hwmon/hwmon*", sysfs_root) >=
	    (int)sizeof(pattern))
		return -1;
	if (glob(pattern, 0, NULL, &paths))
		return -1;

	for (i = 0; i < paths.gl_pathc; i++) {
		int channel;
		int score;

		snprintf(name_file, sizeof(name_file), "%s/name", paths.gl_pathv[i]);
		if (read_text_file(name_file, hwmon_name, sizeof(hwmon_name)))
			continue;

		if (!is_auto(config->fan_hwmon)) {
			if (strcmp(config->fan_hwmon, hwmon_name) != 0)
				continue;
			score = 0;
		} else {
			score = strcmp(hwmon_name, "pwmfan") == 0 ? 0 : 100;
		}

		for (channel = 1; channel <= MAX_HWMON_CHANNELS; channel++) {
			snprintf(candidate, sizeof(candidate), "%s/pwm%d",
				 paths.gl_pathv[i], channel);
			if (access(candidate, R_OK | W_OK))
				continue;
			if (score < best_score) {
				copy_string(best, sizeof(best), candidate);
				best_score = score;
			}
			break;
		}
	}

	globfree(&paths);
	if (!best[0])
		return -1;
	if (copy_string(runtime->fan_file, sizeof(runtime->fan_file), best))
		return -1;

	return derive_fan_paths(runtime->fan_file, runtime);
}

static bool is_cooling_state_path(const char *path)
{
	return strstr(path, "/cooling_device") &&
	       strcmp(strrchr(path, '/') ? strrchr(path, '/') + 1 : path,
		      "cur_state") == 0;
}

static int resolve_paths(const struct fan_config *config,
			 struct fan_runtime *runtime)
{
	memset(runtime, 0, sizeof(*runtime));
	copy_string(runtime->enable_file, sizeof(runtime->enable_file),
		    config->enable_file);

	if (is_auto(config->thermal_file)) {
		if (discover_thermal_file(config, runtime->thermal_file,
					  sizeof(runtime->thermal_file))) {
			syslog(LOG_ERR, "no readable thermal sensor was found");
			return -1;
		}
	} else if (copy_string(runtime->thermal_file,
			       sizeof(runtime->thermal_file), config->thermal_file) ||
		   access(runtime->thermal_file, R_OK)) {
		syslog(LOG_ERR, "temperature input is not readable: %s",
		       config->thermal_file);
		return -1;
	}

	if (is_auto(config->fan_file)) {
		if (discover_fan_file(config, runtime)) {
			syslog(LOG_ERR, "no writable hwmon PWM output was found");
			return -1;
		}
	} else {
		if (is_cooling_state_path(config->fan_file)) {
			syslog(LOG_ERR,
			       "%s is a discrete cooling state, not a continuous PWM output",
			       config->fan_file);
			return -1;
		}
		if (copy_string(runtime->fan_file, sizeof(runtime->fan_file),
				config->fan_file) || access(runtime->fan_file, R_OK | W_OK)) {
			syslog(LOG_ERR, "PWM output is not readable and writable: %s",
			       config->fan_file);
			return -1;
		}
		if (derive_fan_paths(runtime->fan_file, runtime)) {
			syslog(LOG_ERR, "failed to derive controls for PWM output: %s",
			       runtime->fan_file);
			return -1;
		}
	}

	if (!is_auto(config->enable_file)) {
		if (copy_string(runtime->enable_file, sizeof(runtime->enable_file),
				config->enable_file) || access(runtime->enable_file, W_OK)) {
			syslog(LOG_ERR, "PWM enable control is not writable: %s",
			       config->enable_file);
			return -1;
		}
	}

	return 0;
}

static int calculate_pwm(const struct fan_config *config, int64_t temp_mc,
			 bool fan_active)
{
	int64_t start_mc = (int64_t)config->start_temp * 1000;
	int64_t stop_mc = (int64_t)(config->start_temp - config->hysteresis) * 1000;
	int64_t full_mc = (int64_t)config->full_speed_temp * 1000;
	int64_t pwm;

	if ((!fan_active && temp_mc < start_mc) ||
	    (fan_active && temp_mc <= stop_mc))
		return 0;
	if (temp_mc <= start_mc)
		return config->start_pwm;
	if (temp_mc >= full_mc)
		return config->max_pwm;

	pwm = config->start_pwm +
	      (temp_mc - start_mc) * (config->max_pwm - config->start_pwm) /
	      (full_mc - start_mc);
	return (int)pwm;
}

static int set_pwm(const struct fan_runtime *runtime, int pwm)
{
	if (write_long_file(runtime->fan_file, pwm)) {
		syslog(LOG_ERR, "failed to write PWM %d to %s: %s", pwm,
		       runtime->fan_file, strerror(errno));
		return -1;
	}
	return 0;
}

static void write_status(const struct fan_runtime *runtime, int64_t temp_mc,
			 int pwm, long rpm, const char *error)
{
	char temporary[PATH_MAX];
	FILE *stream;

	if (snprintf(temporary, sizeof(temporary), "%s.%ld", status_file,
		     (long)getpid()) >= (int)sizeof(temporary))
		return;

	stream = fopen(temporary, "w");
	if (!stream)
		return;

	fprintf(stream,
		"running=1\n"
		"fan_active=%d\n"
		"temperature_mc=%lld\n"
		"pwm=%d\n"
		"rpm=%ld\n"
		"thermal_file=%s\n"
		"fan_file=%s\n"
		"error=%s\n",
		runtime->fan_active ? 1 : 0, (long long)temp_mc, pwm, rpm,
		runtime->thermal_file, runtime->fan_file, error ? error : "");
	if (fclose(stream) || rename(temporary, status_file))
		unlink(temporary);
}

static void signal_handler(int signal_number)
{
	(void)signal_number;
	stop_requested = 1;
}

static int install_signal_handlers(void)
{
	struct sigaction action = {
		.sa_handler = signal_handler,
	};

	sigemptyset(&action.sa_mask);
	return sigaction(SIGINT, &action, NULL) ||
	       sigaction(SIGTERM, &action, NULL);
}

static void set_defaults(struct fan_config *config)
{
	memset(config, 0, sizeof(*config));
	copy_string(config->thermal_file, sizeof(config->thermal_file), AUTO_VALUE);
	copy_string(config->thermal_zone, sizeof(config->thermal_zone), AUTO_VALUE);
	copy_string(config->fan_file, sizeof(config->fan_file), AUTO_VALUE);
	copy_string(config->fan_hwmon, sizeof(config->fan_hwmon), AUTO_VALUE);
	copy_string(config->enable_file, sizeof(config->enable_file), AUTO_VALUE);
	config->start_temp = 45;
	config->full_speed_temp = 85;
	config->hysteresis = 3;
	config->start_pwm = 64;
	config->max_pwm = 255;
	config->kick_pwm = 255;
	config->kick_ms = 500;
	config->fail_safe_pwm = 255;
	config->exit_pwm = 255;
	config->temp_div = 1000;
	config->interval = 5;
}

static void parse_options(int argc, char **argv, struct fan_config *config)
{
	int option;

	while ((option = getopt(argc, argv, "T:Z:F:N:E:t:x:H:s:m:k:K:f:q:d:i:D1vh")) != -1) {
		switch (option) {
		case 'T':
			if (copy_string(config->thermal_file,
					sizeof(config->thermal_file), optarg))
				exit(EXIT_FAILURE);
			break;
		case 'Z':
			if (copy_string(config->thermal_zone, sizeof(config->thermal_zone), optarg))
				exit(EXIT_FAILURE);
			break;
		case 'F':
			if (copy_string(config->fan_file, sizeof(config->fan_file), optarg))
				exit(EXIT_FAILURE);
			break;
		case 'N':
			if (copy_string(config->fan_hwmon, sizeof(config->fan_hwmon), optarg))
				exit(EXIT_FAILURE);
			break;
		case 'E':
			if (copy_string(config->enable_file, sizeof(config->enable_file), optarg))
				exit(EXIT_FAILURE);
			break;
		case 't':
			config->start_temp = parse_int(optarg, -100, 200, "start temperature");
			break;
		case 'x':
			config->full_speed_temp = parse_int(optarg, -99, 250,
							   "full-speed temperature");
			break;
		case 'H':
			config->hysteresis = parse_int(optarg, 0, 50, "hysteresis");
			break;
		case 's':
			config->start_pwm = parse_int(optarg, 1, 255, "start PWM");
			break;
		case 'm':
			config->max_pwm = parse_int(optarg, 1, 255, "maximum PWM");
			break;
		case 'k':
			config->kick_pwm = parse_int(optarg, 0, 255, "kick PWM");
			break;
		case 'K':
			config->kick_ms = parse_int(optarg, 0, 10000, "kick duration");
			break;
		case 'f':
			config->fail_safe_pwm = parse_int(optarg, 0, 255, "fail-safe PWM");
			break;
		case 'q':
			config->exit_pwm = parse_int(optarg, 0, 255, "exit PWM");
			break;
		case 'd':
			config->temp_div = parse_int(optarg, 1, 1000000,
						     "temperature divisor");
			break;
		case 'i':
			config->interval = parse_int(optarg, 1, 300, "polling interval");
			break;
		case 'D':
			config->debug = true;
			break;
		case '1':
			config->once = true;
			break;
		case 'v':
			printf("%s %s\n", PROGRAM_NAME, PROGRAM_VERSION);
			exit(EXIT_SUCCESS);
		case 'h':
			usage(stdout, argv[0]);
			exit(EXIT_SUCCESS);
		default:
			usage(stderr, argv[0]);
			exit(EXIT_FAILURE);
		}
	}
}

static int validate_config(const struct fan_config *config)
{
	if (config->full_speed_temp <= config->start_temp) {
		fprintf(stderr, "Full-speed temperature must exceed start temperature\n");
		return -1;
	}
	if (config->start_pwm > config->max_pwm) {
		fprintf(stderr, "Start PWM must not exceed maximum PWM\n");
		return -1;
	}
	if (config->kick_ms && !config->kick_pwm) {
		fprintf(stderr, "Kick PWM must be non-zero when kick duration is enabled\n");
		return -1;
	}
	return 0;
}

int main(int argc, char **argv)
{
	struct fan_config config;
	struct fan_runtime runtime;
	const char *environment;
	bool sensor_failed = false;
	int exit_code = EXIT_SUCCESS;

	set_defaults(&config);
	parse_options(argc, argv, &config);
	if (validate_config(&config))
		return EXIT_FAILURE;

	environment = getenv("FANCONTROL_SYSFS_ROOT");
	if (environment && environment[0])
		sysfs_root = environment;
	environment = getenv("FANCONTROL_STATUS_FILE");
	if (environment && environment[0])
		status_file = environment;

	openlog(PROGRAM_NAME, LOG_PID | LOG_CONS, LOG_DAEMON);
	if (install_signal_handlers()) {
		syslog(LOG_ERR, "failed to install signal handlers: %s", strerror(errno));
		return EXIT_FAILURE;
	}

	if (resolve_paths(&config, &runtime))
		return EXIT_FAILURE;

	if (runtime.enable_file[0] && write_long_file(runtime.enable_file, 1))
		syslog(LOG_WARNING, "failed to select manual PWM mode through %s: %s",
		       runtime.enable_file, strerror(errno));

	syslog(LOG_NOTICE, "using temperature input %s and PWM output %s",
	       runtime.thermal_file, runtime.fan_file);

	while (!stop_requested) {
		long raw_temp;
		long actual_pwm = -1;
		long rpm = -1;
		int64_t temp_mc = -1;
		int target_pwm;

		if (read_long_file(runtime.thermal_file, &raw_temp)) {
			target_pwm = config.fail_safe_pwm;
			if (set_pwm(&runtime, target_pwm))
				exit_code = EXIT_FAILURE;
			runtime.fan_active = target_pwm > 0;
			write_status(&runtime, temp_mc, target_pwm, rpm,
				     "temperature-read-failed");
			if (!sensor_failed)
				syslog(LOG_ERR,
				       "failed to read temperature from %s; using fail-safe PWM %d",
				       runtime.thermal_file, target_pwm);
			sensor_failed = true;
		} else {
			if (sensor_failed)
				syslog(LOG_NOTICE, "temperature input %s recovered",
				       runtime.thermal_file);
			sensor_failed = false;
			temp_mc = (int64_t)raw_temp * 1000 / config.temp_div;
			target_pwm = calculate_pwm(&config, temp_mc, runtime.fan_active);

			if (target_pwm > 0 && !runtime.fan_active &&
			    config.kick_pwm > 0 && config.kick_ms > 0) {
				if (!set_pwm(&runtime, config.kick_pwm))
					sleep_ms((unsigned int)config.kick_ms);
			}

			if (!stop_requested &&
			    (read_long_file(runtime.fan_file, &actual_pwm) ||
			     actual_pwm != target_pwm) && set_pwm(&runtime, target_pwm))
				exit_code = EXIT_FAILURE;

			runtime.fan_active = target_pwm > 0;
			if (runtime.rpm_file[0])
				read_long_file(runtime.rpm_file, &rpm);
			write_status(&runtime, temp_mc, target_pwm, rpm, NULL);

			if (config.debug)
				syslog(LOG_DEBUG, "temperature=%lldmC pwm=%d rpm=%ld",
				       (long long)temp_mc, target_pwm, rpm);
		}

		if (config.once)
			break;
		sleep_ms((unsigned int)config.interval * 1000);
	}

	if (!config.once && set_pwm(&runtime, config.exit_pwm))
		exit_code = EXIT_FAILURE;
	unlink(status_file);
	closelog();
	return exit_code;
}
