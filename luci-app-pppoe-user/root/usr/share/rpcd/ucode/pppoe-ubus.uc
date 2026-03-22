#!/usr/bin/ucode
import { ubus } from 'ubus';
import { unlink } from 'fs';

let conn = ubus.connect();
if (!conn) exit(1);

conn.add({
    name: 'pppoe.user',
    methods: {
        kill: {
            args: { session_file: '', pid: '' },
            call: function(req, args) {
                if (!args.session_file || !args.pid)
                    return { error: 'Invalid arguments' };
                
                try {
                    unlink(args.session_file);
                    system(`kill -15 ${args.pid}`);
                    return { success: true };
                } catch (e) {
                    return { error: e };
                }
            }
        }
    }
});

conn.listen();
