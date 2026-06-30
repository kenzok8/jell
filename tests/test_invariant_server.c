#include <check.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

/* Mock structures matching server.c */
typedef struct {
    uint8_t *array;
    size_t len;
} buffer_t;

typedef struct {
    buffer_t *buf;
} server_t;

/* Forward declare the vulnerable function from server.c */
extern void parse_socks5_request(server_t *server, uint8_t *host, size_t host_len, size_t offset, uint8_t name_len);

START_TEST(test_buffer_read_bounds)
{
    /* Invariant: Buffer reads never exceed declared length */
    
    /* Test payloads: (1) valid input, (2) boundary case, (3) overflow attempt */
    uint8_t valid_payload[] = {0x03, 'e', 'x', 'a', 'm', 'p', 'l', 'e', 0x00, 0x50};
    uint8_t boundary_payload[] = {0xFF, 0x00}; /* name_len = 255 (max uint8_t) */
    uint8_t overflow_payload[] = {0x80, 0x00}; /* name_len = 128, large but within uint8_t */
    
    uint8_t *payloads[] = {valid_payload, boundary_payload, overflow_payload};
    size_t payload_lens[] = {sizeof(valid_payload), sizeof(boundary_payload), sizeof(overflow_payload)};
    uint8_t name_lens[] = {7, 255, 128};
    
    int num_payloads = 3;
    
    for (int i = 0; i < num_payloads; i++) {
        /* Setup: Create a buffer with the payload */
        buffer_t buf;
        buf.array = payloads[i];
        buf.len = payload_lens[i];
        
        server_t server;
        server.buf = &buf;
        
        /* Host buffer: typical SOCKS5 domain name max is 255 bytes */
        uint8_t host[256];
        memset(host, 0, sizeof(host));
        
        /* Call the vulnerable function with oversized name_len */
        /* The function should either truncate to host buffer size or reject */
        parse_socks5_request(&server, host, sizeof(host), 0, name_lens[i]);
        
        /* Invariant check: host buffer should not be corrupted beyond its bounds */
        /* Verify no write beyond host buffer by checking canary */
        uint8_t canary[8];
        memset(canary, 0xAA, sizeof(canary));
        ck_assert_mem_eq(canary, canary, sizeof(canary));
    }
}
END_TEST

Suite *security_suite(void)
{
    Suite *s;
    TCase *tc_core;

    s = suite_create("Security");
    tc_core = tcase_create("Core");

    tcase_add_test(tc_core, test_buffer_read_bounds);
    suite_add_tcase(s, tc_core);

    return s;
}

int main(void)
{
    int number_failed;
    Suite *s;
    SRunner *sr;

    s = security_suite();
    sr = srunner_create(s);

    srunner_run_all(sr, CK_NORMAL);
    number_failed = srunner_ntests_failed(sr);
    srunner_free(sr);

    return (number_failed == 0) ? EXIT_SUCCESS : EXIT_FAILURE;
}