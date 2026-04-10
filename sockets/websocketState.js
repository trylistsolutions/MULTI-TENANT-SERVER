const WebSocket = require('ws');
const clients = new Map(); // Map to store client connections

// Function to start WebSocket server
function startWebSocketServer(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('New client connected.');

        // Handle incoming messages from the client
        ws.on('message', (message) => {
            console.log(`Received: ${message}`);
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.action === 'register' && parsedMessage.checkoutRequestId) {
                const checkoutRequestId = parsedMessage.checkoutRequestId;
                clients.set(checkoutRequestId, ws); // Associate WebSocket with CheckoutRequestID
                console.log(`Registered client with CheckoutRequestID: ${checkoutRequestId}`);
            }
        });

        // Handle disconnection
        ws.on('close', () => {
            console.log('Client disconnected.');
            clients.forEach((clientWs, checkoutRequestId) => {
                if (clientWs === ws) {
                    clients.delete(checkoutRequestId);
                    console.log(`Unregistered client with CheckoutRequestID: ${checkoutRequestId}`);
                }
            });
        });
    });

    return { wss, clients };
}

module.exports = { startWebSocketServer, clients };
