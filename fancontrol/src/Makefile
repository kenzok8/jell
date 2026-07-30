CC ?= cc
CFLAGS ?= -O2
CFLAGS += -Wall -Wextra -Wformat=2

all: fancontrol

fancontrol: %: %.o
	$(CC) $(LDFLAGS) -o $@ $^

%.o: %.c
	$(CC) $(CPPFLAGS) $(CFLAGS) -o $@ -c $<

clean:
	rm -f fancontrol *.o *~
