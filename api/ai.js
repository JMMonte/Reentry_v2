console.log("API route loaded", process.env.OPENAI_API_KEY);

export default async function handler(req, res) {
    console.log("API route hit", req.method, req.body);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages, systemPrompt, tools } = req.body;
    console.log("Received body:", { messages, systemPrompt, tools });
    console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY);

    // Prepare OpenAI request
    const openaiPayload = {
        model: 'gpt-4.1',
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages
        ],
        tools
    };
    console.log("Sending to OpenAI:", openaiPayload);

    // Make the OpenAI API call
    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(openaiPayload)
    });

    console.log("OpenAI response status:", openaiRes.status);
    const data = await openaiRes.text();
    console.log("OpenAI response body:", data);

    // Return the response to the client
    res.status(openaiRes.status).send(data);
} 