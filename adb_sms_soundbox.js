/**
 * ADB SMS Soundbox Background Bridge
 * 
 * This script runs on your PC and monitors your connected Android phone's SMS inbox.
 * When a new SMS is received, it automatically forwards it to the phone's background 
 * Soundbox speaker using a direct ADB broadcast.
 * 
 * Bypasses all Xiaomi / Android background limits without requiring manual settings.
 */

const { execSync } = require('child_process');

// Configuration
const POLL_INTERVAL_MS = 2000; // Check every 2 seconds
const ADB_PATH = 'C:\\Users\\admin\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

let lastSeenTimestamp = 0;
let isFirstRun = true;

function runCommand(cmd) {
    try {
        return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
    } catch (err) {
        return null;
    }
}

function pollSms() {
    const cmd = `"${ADB_PATH}" shell content query --uri content://sms/inbox --projection address:body:date`;
    const stdout = runCommand(cmd);
    
    if (!stdout) {
        console.log('[-] Phone not connected or ADB offline. Retrying...');
        return;
    }

    // Split output into rows (handles multi-line SMS bodies correctly)
    const rows = stdout.split(/(?=\n?Row: \d+)/);
    const newMessages = [];

    for (const row of rows) {
        const cleanRow = row.trim().replace(/\r/g, '');
        const match = cleanRow.match(/^Row: \d+ address=(.*?), body=([\s\S]*), date=(\d+)$/);
        
        if (match) {
            const address = match[1];
            const body = match[2];
            const date = parseInt(match[3], 10);

            if (isFirstRun) {
                // Initialize timestamp on first run so we don't speak old messages
                if (date > lastSeenTimestamp) {
                    lastSeenTimestamp = date;
                }
            } else if (date > lastSeenTimestamp) {
                newMessages.push({ address, body, date });
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
        console.log(`[+] Soundbox Bridge Started! Monitoring SMS. Last synced timestamp: ${lastSeenTimestamp}`);
        return;
    }

    // Sort new messages ascending (oldest first) so they speak in order of arrival
    newMessages.sort((a, b) => a.date - b.date);

    for (const msg of newMessages) {
        console.log(`[+] New SMS detected from: ${msg.address}`);
        console.log(`    Body: ${msg.body.replace(/\n/g, ' ')}`);
        
        // Update watermark
        if (msg.date > lastSeenTimestamp) {
            lastSeenTimestamp = msg.date;
        }

        // Forward to the app's background speaker using direct ADB broadcast
        // Escape single quotes for the adb shell argument
        const escapedBody = msg.body.replace(/'/g, "'\\''");
        const broadcastCmd = `"${ADB_PATH}" shell "am broadcast -a com.autopaytracker.TEST_SMS -n com.autopaytracker/.TestSMSReceiver --es sender '${msg.address}' --es body '${escapedBody}'"`;
        
        console.log(`    Forwarding to Soundbox...`);
        const result = runCommand(broadcastCmd);
        if (result && result.includes('Broadcast completed')) {
            console.log(`    [✓] Successfully spoken!`);
        } else {
            console.log(`    [✗] Forwarding failed.`);
        }
    }
}

// Start polling loop
console.log('Checking device connection...');
const devices = runCommand(`"${ADB_PATH}" devices`);
console.log(devices);

setInterval(pollSms, POLL_INTERVAL_MS);
// Run immediately on startup
pollSms();
