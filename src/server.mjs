import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import OpenAI from 'openai';
import { Server } from 'socket.io';
import http from 'http';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
    }
});
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

const assistantId = 'asst_9eVC9DmufoOvrB3nIKcLB1Cy';

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendData = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    req.on('close', () => {
        console.log('Client disconnected');
        res.end();
    });

    req.app.locals.sendData = sendData;
});

app.post('/chat', async (req, res) => {
    const { message } = req.body;

    try {
        const thread = await openai.beta.threads.create();
        await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: message
        });

        const run = openai.beta.threads.runs.stream(thread.id, {
            assistant_id: assistantId
        });

        let reply = '';
        run.on('textDelta', (textDelta) => {
            process.stdout.write(textDelta.value);
            reply += textDelta.value;

            if (req.app.locals.sendData) {
                req.app.locals.sendData({ textDelta: textDelta.value });
            }
        });

        run.on('toolCallCreated', async (toolCall) => {
            console.log('Received tool call:', toolCall);
            if (toolCall.function.name === "createSatellite") {
                let args;
                try {
                    console.log('Arguments received:', toolCall.function.arguments || '<empty>');
                    args = JSON.parse(toolCall.function.arguments || '{}');
                } catch (error) {
                    console.error('Invalid JSON data:', toolCall.function.arguments, 'Error:', error);
                    return;
                }

                console.log('Parsed arguments:', args);

                const { latitude, longitude, altitude, velocity, azimuth, angleOfAttack } = args;
                if (latitude === undefined || longitude === undefined || altitude === undefined || velocity === undefined || azimuth === undefined || angleOfAttack === undefined) {
                    console.error('Missing arguments:', args);
                    return;
                }

                console.log('Parsed arguments:', { latitude, longitude, altitude, velocity, azimuth, angleOfAttack });

                io.emit('createSatellite', { latitude, longitude, altitude, velocity, azimuth, angleOfAttack });

                await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
                    tool_outputs: [
                        {
                            tool_call_id: toolCall.id,
                            output: JSON.stringify({ status: 'Satellite creation initiated' })
                        }
                    ]
                });
            }
        });

        run.on('end', () => {
            if (req.app.locals.sendData) {
                req.app.locals.sendData({ end: true });
            }
            res.json({ reply });
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to communicate with ChatGPT' });
    }
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
