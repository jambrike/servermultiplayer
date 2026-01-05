const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Default route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// Store connected players
const players = new Map();
let playerOrder = [];
let currentTurn = 0;

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle login
    socket.on('login', (data) => {
        console.log('User logged in:', data.username);

        // Store player info
        players.set(socket.id, {
            username: data.username,
            socketId: socket.id
        });

        // Send confirmation back to client
        socket.emit('loginSuccess', {
            socketId: socket.id,
            username: data.username
        });

        // Notify other players
        socket.broadcast.emit('playerJoined', {
            username: data.username,
            socketId: socket.id
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            console.log('User disconnected:', player.username);
            players.delete(socket.id);

            // Notify other players
            socket.broadcast.emit('playerLeft', {
                username: player.username,
                socketId: socket.id
            });
        }
    });

    socket.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'rolldice':
                    rolldice(socket);
                    break;
            }
        } catch (error) {
            console.log("Invalid type");
        }
    });
});

function rolldice(socket) {
    // 1. Validation: Is it actually this player's turn?
    if (socket.id !== playerOrder[currentTurn]) {
        socket.emit('error_message', "It's not your turn!");
        return;
    }

    // 2. Generate the result on the server
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    // 3. Broadcast result to EVERYONE (including the roller)
    io.emit('diceRolled', {
        username: players.get(socket.id).username,
        d1: d1,
        d2: d2,
        socketId: socket.id
    });

    nextTurn();
}

function nextTurn() {
    if (playerOrder.length === 0) return;

    currentTurn = (currentTurn + 1) % playerOrder.length;
    const nextPlayerId = playerOrder[currentTurn];

    io.emit('turnUpdate', {
        activePlayerId: nextPlayerId,
        username: players.get(nextPlayerId).username
    });
}

// Start server
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});