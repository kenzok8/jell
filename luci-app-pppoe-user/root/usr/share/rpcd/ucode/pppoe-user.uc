#!/usr/bin/ucode
/* /usr/share/ucode/pppoe-user.uc */

import { readfile, listdir, stat } from 'fs';
import { exec } from 'ubus';
import { parse } from 'jsonc';

const SESSION_PATH = '/var/etc/pppoe-user/session';
const LOG_PATH = '/var/pppoe-user/log/interface.log';

// 获取在线用户列表
export function get_online_users() {
    let users = [];
    let count = 0;

    // 统计 ppp 接口数量 (模拟原 lua 逻辑)
    try {
        let dev = readfile('/proc/net/dev');
        if (dev) {
            for (let line in split(dev, /\n/)) {
                if (match(line, /^\s*ppp/)) count++;
            }
        }
    } catch (e) {}

    if (!stat(SESSION_PATH)) return { count: count, sessions: [] };

    let files = listdir(SESSION_PATH);
    if (!files) return { count: count, sessions: [] };

    for (let filename in files) {
        let filepath = `${SESSION_PATH}/${filename}`;
        if (!stat(filepath)?.is_regular) continue;

        try {
            let content = readfile(filepath);
            if (content) {
                let data = parse(content);
                if (data) {
                    data.session_file = filepath;
                    push(users, data);
                }
            }
        } catch (e) {
            warn(`Failed to read ${filepath}: ${e}`);
        }
    }

    return { count: count, sessions: users };
}

// 强制下线用户
export function kill_user(session_file, pid) {
    if (!session_file || !pid) return { error: 'Invalid parameters' };

    try {
        // 删除会话文件
        unlink(session_file);
        
        // 杀死进程
        let ret = system(`kill -15 ${pid}`);
        
        return { success: true };
    } catch (e) {
        return { error: e };
    }
}

// 获取接口日志
export function get_interface_log() {
    if (!stat(LOG_PATH)) return '';
    
    try {
        // 读取最后 200 行 (简单实现，ucode 没有直接的 tail，需读取后分割)
        let content = readfile(LOG_PATH);
        if (!content) return '';
        
        let lines = split(content, /\n/);
        let tail_lines = slice(lines, -200);
        // 反转以符合原逻辑 (最新在上)
        return join(reverse(tail_lines), '\n');
    } catch (e) {
        return `Error reading log: ${e}`;
    }
}

// 获取下线用户统计 (简单模拟，实际需解析 UCI)
export function get_downtime_count() {
    // 这里可以通过 ubus 调用 uci 或者直接解析 /etc/config/pppoe-user
    // 为简化，建议在 JS 层直接处理 UCI 数据，或者在此处调用 uci get
    try {
        let res = exec('uci', { 'command': 'show', 'params': ['pppoe-user'] });
        if (res && res.output) {
            let lines = split(res.output, /\n/);
            let cnt = 0;
            for (let line in lines) {
                if (match(line, /=enabled$/)) { // 粗略匹配，更严谨需解析 value
                     // 实际上 ucidef 或 uci get 更好，这里仅作演示逻辑占位
                     // 建议在前端 JS 直接遍历 uci.load('pppoe-user')
                }
            }
            // 由于 ucode 直接调 uci 命令解析较繁琐，推荐此逻辑移至前端 JS 处理 UCI 对象
            return 0; 
        }
    } catch (e) {}
    return 0;
}
