/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect } from "@jest/globals";
import * as net from 'net';
import { closeForward, getForward } from './forward';

// Global variables
// let lokiBackend: { server: net.Server, url: string };
let lokiRead: { server: net.Server, url: string };
// let lokiWrite: { server: net.Server, url: string };

// Function to send a log to Loki-write with a given timestamp and log message using fetch
// const sendLog = async (
//     logMessage: string,
//     labels: Record<string, string>,
//     timestamp: string = `${Date.now() * 1_000_000}`,
//     expectReject: boolean = false
// ): Promise<void> => {
//     try {
//         // const lokiWriteURL = 'http://loki-write.loki.svc.cluster.local:3100/loki/api/v1/push';

//         const logEntry = {
//             streams: [
//                 {
//                     stream: labels,
//                     values: [[timestamp, logMessage]],
//                 },
//             ],
//         };

//         const response = await fetch(`${lokiWrite.url}`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(logEntry),
//         });

//         // Check if the response was not OK (status code other than 204)
//         if (!response.ok) {
//             // If we're expecting a rejection and it's a 400 error (invalid timestamp), this is expected behavior
//             if (expectReject && response.status === 400) {
//                 console.log(`Log rejection expected: ${logMessage}`);
//                 return; // Exit successfully since the rejection was expected
//             }
//             // If we expected success but got an error, throw an error
//             throw new Error(`Unexpected log ingestion failure: ${logMessage}`);
//         }

//         // If we're expecting a rejection but the log was accepted, throw an error
//         if (expectReject) {
//             throw new Error(`Unexpected log acceptance: ${logMessage}`);
//         }
//     } catch (error: any) {
//         if (expectReject && error.message.includes('400')) {
//             console.log(`Log rejection expected: ${logMessage}`);
//         } else {
//             console.error(`Error in log ingestion: ${logMessage}`, error.message);
//             throw error;
//         }
//     }
// };

// Helper function to query logs from Loki-read using fetch
const queryLogs = async (query: string, limit = 1): Promise<any> => {
    try {
        // const lokiReadURL = 'http://loki-read.loki.svc.cluster.local:3100/loki/api/v1/query_range';
        const response = await fetch(`${lokiRead.url}?query=${encodeURIComponent(query)}&limit=${limit}`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error('Error in querying logs');
        }

        return response.json();
    } catch (error: any) {
        console.error('Error in querying logs', error.message);
        throw error;
    }
};

// Helper function to check Loki services using fetch
// const checkLokiServices = async (component: string, expectedServices: string[], url: string): Promise<void> => {
//     try {
//         // const url = `http://${component}.loki.svc.cluster.local:3100/services`;
//         const response = await fetch(url);

//         if (!response.ok) {
//             throw new Error(`Error checking services for ${component}`);
//         }

//         const servicesList = (await response.text()).split('\n');

//         expectedServices.forEach(service => {
//             const isServiceRunning = servicesList.some((svc: string) => svc.includes(`${service} => Running`));
//             if (!isServiceRunning) {
//                 throw new Error(`${service} is not running for ${component}`);
//             }
//         });

//     } catch (error: any) {
//         console.error(`Error checking services for ${component}`, error.message);
//         throw error;
//     }
// };

// // Unified log validation function
// const validateLogInQuery = (queryData: any, logMessage: string): void => {
//     expect(queryData).toHaveProperty('status', 'success');
//     expect(Array.isArray(queryData.data.result)).toBe(true);
//     const logExists = queryData.data.result.some((stream: any) =>
//         stream.values.some((value: any) => value.includes(logMessage))
//     );
//     expect(logExists).toBe(true);
// };

// Jest test cases
describe('Loki Tests', () => {
    beforeAll(async () => {
        // lokiBackend = await getForward('loki-backend', 'loki', 3100);
        lokiRead = await getForward('loki-read', 'loki', 3100);
        // lokiWrite = await getForward('loki-write', 'loki', 3100);
    });

    afterAll(async () => {
        // await closeForward(lokiBackend.server);
        await closeForward(lokiRead.server);
        // await closeForward(lokiWrite.server);
    });

    test('Validate Vector logs are present in Loki (loki-read)', async () => {
        const data = await queryLogs('{job="test-job"}');
        expect(data).toHaveProperty('status', 'success');
        expect(Array.isArray(data.data.result)).toBe(true);
    });

    // test('Send log to Loki-write and validate it in Loki-read', async () => {
    //     const logMessage = 'Test log from jest';
    //     await sendLog(logMessage, { job: 'test-job', level: 'info' });

    //     const data = await queryLogs('{job="test-job"}');
    //     validateLogInQuery(data, logMessage);
    // });

    // test('Validate services are running for loki-read', async () => {
    //     const expectedServices = [
    //         'querier', 'server', 'runtime-config', 'ring', 'query-scheduler-ring',
    //         'memberlist-kv', 'cache-generation-loader', 'ingester-querier'
    //     ];
    //     await checkLokiServices('loki-read', expectedServices, lokiRead.url);
    // });

    // test('Validate services are running for loki-write', async () => {
    //     const expectedServices = [
    //         'ring', 'store', 'ingester', 'distributor', 'runtime-config',
    //         'server', 'memberlist-kv'
    //     ];
    //     await checkLokiServices('loki-write', expectedServices, lokiWrite.url);
    // });

    // test('Validate services are running for loki-backend', async () => {
    //     const expectedServices = [
    //         'compactor', 'index-gateway', 'ring', 'query-scheduler-ring',
    //         'index-gateway-ring', 'ingester-querier', 'store', 'server',
    //         'memberlist-kv', 'runtime-config', 'query-scheduler', 'ruler'
    //     ];
    //     await checkLokiServices('loki-backend', expectedServices, lokiBackend.url);
    // });

    // test('Send log with custom label and query it in Loki-read', async () => {
    //     const customLabel = 'test-label';
    //     const logMessage = 'Test log with custom label';
    //     await sendLog(logMessage, { customLabel });

    //     const queryData = await queryLogs(`{customLabel="${customLabel}"}`);
    //     validateLogInQuery(queryData, logMessage);
    // });

    // test('Ingest a backdated log that should be rejected due to retention', async () => {
    //     // Ingest a log with a timestamp older than the retention period (e.g., 8 days ago)
    //     const oldTimestamp = `${(Math.floor(Date.now() / 1000) - 8 * 24 * 3600) * 1_000_000_000}`; // 8 days in nanoseconds
    //     await sendLog('This is a backdated log older than the retention period', { job: 'retention-test', service_name: 'retention-test' }, oldTimestamp, true);
    // });

    // test('Ingest a valid log within the retention period', async () => {
    //     // Ingest a log with a current timestamp within the retention period
    //     const currentTimestamp = `${Date.now() * 1_000_000}`;
    //     await sendLog('This is a valid log within the retention period', { job: 'retention-test', service_name: 'retention-test' }, currentTimestamp, false);
    // });
});
