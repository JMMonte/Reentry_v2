import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import OpenAI from 'openai';
import { Server } from 'socket.io';
import http from 'http';
import { EventEmitter } from 'events';

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
let threadId = null;

const functionConfig = {
    createSatelliteFromLatLon: {
        requiredArgs: ['latitude', 'longitude', 'altitude', 'velocity', 'azimuth', 'angleOfAttack'],
        handler: (args) => {
            const { latitude, longitude, altitude, velocity, azimuth, angleOfAttack } = args;
            console.log(`Emitting createSatelliteFromLatLon with args: ${JSON.stringify(args)}`);
            io.emit('createSatelliteFromLatLon', { latitude, longitude, altitude, velocity, azimuth, angleOfAttack });
            return { status: 'Satellite creation from LatLon initiated' };
        }
    },
    createSatelliteFromOrbitalElements: {
        requiredArgs: ['semiMajorAxis', 'eccentricity', 'inclination', 'raan', 'argumentOfPeriapsis', 'trueAnomaly'],
        handler: (args) => {
            const { semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly } = args;
            console.log(`Emitting createSatelliteFromOrbitalElements with args: ${JSON.stringify(args)}`);
            io.emit('createSatelliteFromOrbitalElements', { semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly });
            return { status: 'Satellite creation from Orbital Elements initiated' };
        }
    }
};

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
        if (!threadId) {
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
        }

        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: message
        });

        const run = openai.beta.threads.runs.stream(threadId, {
            assistant_id: assistantId
        });

        const eventHandler = new EventHandler(openai, req.app.locals.sendData, io);
        run.on('event', eventHandler.onEvent.bind(eventHandler));

        run.on('end', () => {
            res.json({ reply: 'Processing' });
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to communicate with ChatGPT' });
    }
});

class EventHandler extends EventEmitter {
    constructor(client, sendData, io) {
        super();
        this.client = client;
        this.sendData = sendData;
        this.io = io;
        this.isNewMessage = true;
    }

    async onEvent(event) {
        try {
            console.log('Event received:', event);
            if (event.event === "thread.message.delta") {
                const textDelta = this.extractTextDelta(event.data.delta.content);
                this.sendData({ textDelta, isNewMessage: this.isNewMessage });
                this.isNewMessage = false;
            } else if (event.event === "toolCallCreated") {
                await this.handleToolCallCreated(event.data);
            } else if (event.event === "thread.run.requires_action") {
                await this.handleRequiresAction(event.data);
            } else if (event.event === "thread.run.ended") {
                this.sendData({ end: true });
                this.isNewMessage = true;
            }
        } catch (error) {
            console.error("Error handling event:", error);
        }
    }

    extractTextDelta(deltaArray) {
        return deltaArray.map(delta => delta.text.value).join('');
    }

    async handleToolCallCreated(toolCall) {
        console.log('Received tool call:', toolCall);
        const { name, arguments: argsString } = toolCall.function;
        let args;

        try {
            console.log('Arguments received:', argsString || '<empty>');
            args = JSON.parse(argsString || '{}');
        } catch (error) {
            console.error('Invalid JSON data:', argsString, 'Error:', error);
            return;
        }

        console.log('Parsed arguments:', args);

        if (functionConfig[name]) {
            const config = functionConfig[name];
            const missingArgs = config.requiredArgs.filter(arg => args[arg] === undefined);

            if (missingArgs.length) {
                console.error(`Missing arguments for ${name}:`, missingArgs);
                return;
            }

            const output = config.handler(args);

            await this.client.beta.threads.runs.submitToolOutputs(toolCall.thread_id, toolCall.run_id, {
                tool_outputs: [
                    {
                        tool_call_id: toolCall.id,
                        output: JSON.stringify(output)
                    }
                ]
            });
        }
    }

    async handleRequiresAction(data) {
        try {
            const toolCalls = data.required_action.submit_tool_outputs.tool_calls;
            const toolOutputs = await Promise.all(toolCalls.map(async (toolCall) => {
                const { name, arguments: argsString } = toolCall.function;
                let args;

                try {
                    console.log('Arguments received:', argsString || '<empty>');
                    args = JSON.parse(argsString || '{}');
                } catch (error) {
                    console.error('Invalid JSON data:', argsString, 'Error:', error);
                    return null;
                }

                console.log('Parsed arguments:', args);

                if (functionConfig[name]) {
                    const config = functionConfig[name];
                    const missingArgs = config.requiredArgs.filter(arg => args[arg] === undefined);

                    if (missingArgs.length) {
                        console.error(`Missing arguments for ${name}:`, missingArgs);
                        return null;
                    }

                    const output = config.handler(args);
                    return {
                        tool_call_id: toolCall.id,
                        output: JSON.stringify(output)
                    };
                }
                return null;
            }));

            const filteredOutputs = toolOutputs.filter(output => output !== null);
            if (filteredOutputs.length > 0) {
                await this.client.beta.threads.runs.submitToolOutputs(data.thread_id, data.id, {
                    tool_outputs: filteredOutputs,
                });
            } else {
                console.error('No valid tool outputs to submit.');
            }
        } catch (error) {
            console.error("Error processing required action:", error);
        }
    }
}

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
