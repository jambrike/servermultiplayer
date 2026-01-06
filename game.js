const socket = io('https://servermultiplayer.onrender.com', {
  transports: ['websocket', 'polling'],
  withCredentials: false
});

const username = localStorage.getItem('username');
if (!username) {
    window.location.href = 'login.html';
}

console.log(`Playing as: ${username}`);

let mySocketId = null;
let isTurn = false;
let rollCount = 0;
let stepsleft = 0;
const otherPlayers = {}; // Stores { username: { x, y } }

let answer = null;
let cluelocations = null; // Will be initialized after we get answer from server

const rows = 18;
const cols = 18;
const gameArea = document.getElementById("game");

const roomTiles = {
    kitchen: {
        x: 0, y: 0, w: 4, h: 4, type: "kitchen", doors: [{ x: 3, y: 3 }],
        spots: [{ x: 1, y: 1, name: "bin" }, { x: 2, y: 3, name: "rug" }, { x: 0, y: 2, name: "drawer" }]
    },
    ballroom: {
        x: 6, y: 0, w: 6, h: 5, type: "ballroom", doors: [{ x: 6, y: 4 }, { x: 11, y: 4 }],
        spots: [{ x: 7, y: 1, name: "bin" }, { x: 10, y: 3, name: "rug" }, { x: 8, y: 0, name: "drawer" }]
    },
    conservatory: {
        x: 13, y: 0, w: 5, h: 4, type: "conservatory", doors: [{ x: 13, y: 3 }],
        spots: [{ x: 14, y: 1, name: "bin" }, { x: 17, y: 1, name: "rug" }, { x: 15, y: 3, name: "drawer" }]
    },
    library: {
        x: 0, y: 11, w: 4, h: 5, type: "library", doors: [{ x: 3, y: 11 }],
        spots: [{ x: 1, y: 12, name: "bin" }, { x: 2, y: 14, name: "rug" }, { x: 1, y: 15, name: "drawer" }]
    },
    study: {
        x: 13, y: 11, w: 5, h: 5, type: "study", doors: [{ x: 13, y: 11 }],
        spots: [{ x: 14, y: 12, name: "bin" }, { x: 17, y: 12, name: "rug" }, { x: 15, y: 15, name: "drawer" }]
    }
};

// Local player state will be set based on server-assigned spawn
const startX = parseInt(localStorage.getItem('startX')) || 9;
const startY = parseInt(localStorage.getItem('startY')) || 9;
const player = { x: startX, y: startY };

function randomFrom(arr) { 
    return arr[Math.floor(Math.random() * arr.length)]; 
}

function initializeClueLocations() {
    if (!answer) return null;
    
    const roompool = Object.keys(roomTiles);
    const shuffledRooms = roompool.sort(() => 0.5 - Math.random());
    
    return {
        suspect: {
            roomKey: shuffledRooms[0], 
            spot: randomFrom(roomTiles[shuffledRooms[0]].spots).name,
            sub: `this is ${answer.suspect}'s item and it has blood stains`
        },
        weapon: {
            roomKey: shuffledRooms[1], 
            spot: randomFrom(roomTiles[shuffledRooms[1]].spots).name,
            sub: `It's the ${answer.weapon}`
        },
        room: {
            roomKey: shuffledRooms[2], 
            spot: randomFrom(roomTiles[shuffledRooms[2]].spots).name,
            sub: `There's some blood in here.`
        }
    };
}

// --- Socket Listeners ---
socket.on('connect', () => {
    console.log('Connected to server with socket ID:', socket.id);
    mySocketId = socket.id;
    localStorage.setItem('socketId', socket.id);
    socket.emit('login', { username });
});

socket.on('loginSuccess', (data) => {
    console.log('Login success:', data);
    if (typeof data.x === 'number' && typeof data.y === 'number') {
        player.x = data.x;
        player.y = data.y;
        localStorage.setItem('startX', String(data.x));
        localStorage.setItem('startY', String(data.y));
    }
    render();
});

socket.on('playersState', (players) => {
    for (const username in otherPlayers) delete otherPlayers[username];
    
    players.forEach(p => {
        if (p.username !== username) {
            otherPlayers[p.username] = { x: p.x, y: p.y };
        } else {
            if (typeof p.x === 'number' && typeof p.y === 'number') {
                player.x = p.x; 
                player.y = p.y;
            }
        }
    });
    render();
});

socket.on('diceRolled', (data) => {
    if (data.username !== username) return;
    
    let steps = data.d1 + data.d2;
    stepsleft = steps;
    rollCount++;
    document.getElementById("stepsleft").textContent = stepsleft;
    document.getElementById("clue-text").textContent = `You rolled a ${steps}. Move!`;
    document.getElementById("clue-text").style.color = "#4CAF50";
});

socket.on('turnUpdate', (data) => {
    isTurn = (data.activeUsername === username);
    stepsleft = 0;
    document.getElementById("stepsleft").textContent = stepsleft;
    const status = document.getElementById("clue-text");
    if (isTurn) {
        status.textContent = "It's your turn! Roll the dice.";
        status.style.color = "#FFD700";
    } else {
        status.textContent = `It's ${data.username}'s turn.`;
        status.style.color = "#888";
    }
});

socket.on('playerMoved', (data) => {
    if (data.username !== username) {
        otherPlayers[data.username] = { x: data.x, y: data.y };
        render();
    }
});

socket.on('playerJoined', (p) => {
    if (p.username !== username) {
        otherPlayers[p.username] = { x: p.x, y: p.y };
        render();
    }
});

socket.on('playerLeft', (p) => {
    delete otherPlayers[p.username];
    render();
});

socket.on('error_message', (msg) => {
    alert(msg);
    console.error('Server error:', msg);
});

socket.on('gameStarted', (data) => {
    console.log('Game started/resumed. My username:', username, 'Active player:', data.activeUsername);
    console.log('Turn order:', data.order.map(p => p.username));
    
    // Store the answer from server
    answer = data.answer;
    console.log('Answer received from server:', answer);
    
    // Initialize clue locations now that we have the answer
    cluelocations = initializeClueLocations();
    console.log('Clue locations initialized:', cluelocations);
    
    isTurn = (data.activeUsername === username);
    
    const status = document.getElementById("clue-text");
    if (isTurn) {
        status.textContent = "It's your turn! Roll the dice.";
        status.style.color = "#FFD700";
    } else {
        status.textContent = `It's ${data.activeUsername}'s turn.`;
        status.style.color = "#888";
    }
});

function RoomAt(x, y) {
    for (let key in roomTiles) {
        let r = roomTiles[key];
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    }
    return null;
}

function caniwalk(targetX, targetY) {
    if (targetX < 0 || targetX >= cols || targetY < 0 || targetY >= rows) return false;
    let currentRoom = RoomAt(player.x, player.y);
    let targetRoom = RoomAt(targetX, targetY);

    if (!currentRoom && targetRoom) {
        return targetRoom.doors.some(door => door.x === targetX && door.y === targetY);
    }
    if (currentRoom && !targetRoom) {
        return currentRoom.doors.some(door => door.x === player.x && door.y === player.y);
    }
    if (currentRoom && targetRoom && currentRoom !== targetRoom) return false;
    return true;
}

// --- Flashcard Ask System ---
document.getElementById("ask-button").onclick = function() {
    if (!isTurn) {
        alert("Not your turn!");
        return;
    }
    
    const suspect = document.getElementById("suspect-select").value;
    const weapon = document.getElementById("weapon-select").value;
    const roomObj = RoomAt(player.x, player.y);

    if (!suspect || !weapon) {
        alert("Please select both suspect and weapon");
        return;
    }
    
    if (!roomObj) {
        alert("You must be in a room to ask!");
        return;
    }
    
    console.log('Asking about:', { suspect, weapon, room: roomObj.type });
    socket.emit('askAbout', { suspect, weapon, room: roomObj.type });
};

socket.on('askResult', (data) => {
    const status = document.getElementById("clue-text");
    
    if (data.result === "none") {
        status.textContent = "None of those cards match!";
        status.style.color = "#FF6B6B";
    } else {
        status.textContent = `Someone has the ${data.result} card!`;
        status.style.color = "#4CAF50";
    }
});

function render() {
    gameArea.innerHTML = "";
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            let cell = document.createElement("div");
            cell.className = "cell";
            let room = RoomAt(x, y);

            let isDoor = false;
            for (let key in roomTiles) {
                if (roomTiles[key].doors.some(d => d.x === x && d.y === y)) {
                    isDoor = true;
                    break;
                }
            }

            if (isDoor) cell.classList.add("door");
            else if (room) {
                cell.classList.add("room", room.type);
                room.spots.forEach(spot => {
                    if (spot.x === x && spot.y === y) {
                        let item = document.createElement("div");
                        item.innerHTML = "🔍";
                        item.style.cursor = "pointer";
                        item.onclick = () => {
                            if (player.x === x && player.y === y) {
                                if (!cluelocations) {
                                    alert("Game not fully initialized yet.");
                                    return;
                                }
                                
                                let foundClue = Object.values(cluelocations).find(c => 
                                    roomTiles[c.roomKey].type === room.type && spot.name === c.spot
                                );
                                if (foundClue) {
                                    document.getElementById("clue-text").textContent = "EVIDENCE: " + foundClue.sub;
                                    document.getElementById("clue-text").style.color = "gold";
                                    alert("You found a good clue!");
                                } else {
                                    alert("Empty.");
                                }
                            } else {
                                alert("Get closer to search!");
                            }
                        };
                        cell.appendChild(item);
                    }
                });
            } else cell.classList.add("floor");

            if (player.x === x && player.y === y) {
                let token = document.createElement("div");
                token.className = "player-token local";
                token.style.cssText = "width:20px;height:20px;background:red;border-radius:50%;margin:5px;box-shadow:0 0 5px #000;";
                token.title = username;
                cell.appendChild(token);
            }

            for (let otherUsername in otherPlayers) {
                let p = otherPlayers[otherUsername];
                if (p.x === x && p.y === y) {
                    let oToken = document.createElement("div");
                    oToken.style.cssText = "width:20px;height:20px;background:purple;border-radius:50%;margin:5px;box-shadow:0 0 5px #000;";
                    oToken.title = otherUsername;
                    cell.appendChild(oToken);
                }
            }
            gameArea.appendChild(cell);
        }
    }
    
    const currentRoom = RoomAt(player.x, player.y);
    document.getElementById("current-room").textContent = currentRoom ? currentRoom.type : "Hallway";
}

document.getElementById("rolldice").onclick = () => {
    if (!isTurn) {
        alert("Not your turn!");
        return;
    }
    console.log('Rolling dice for', username);
    socket.emit('rolldice');
};

document.addEventListener("keydown", e => {
    if (!isTurn || stepsleft <= 0) return;
    let dx = 0, dy = 0;
    if (e.key === "ArrowUp") dy = -1;
    if (e.key === "ArrowDown") dy = 1;
    if (e.key === "ArrowLeft") dx = -1;
    if (e.key === "ArrowRight") dx = 1;

    if (dx === 0 && dy === 0) return;

    let nx = player.x + dx;
    let ny = player.y + dy;

    if (caniwalk(nx, ny)) {
        let wasInRoom = RoomAt(player.x, player.y);
        player.x = nx; player.y = ny;
        stepsleft--;
        document.getElementById("stepsleft").textContent = stepsleft;

        socket.emit('playerInfo', { x: player.x, y: player.y, username });

        let nowInRoom = RoomAt(nx, ny);
        render();

        if (nowInRoom && !wasInRoom) {
            stepsleft = 0;
            document.getElementById("stepsleft").textContent = 0;
            socket.emit('endTurn');
            setTimeout(() => alert("Search the " + nowInRoom.type + " for clues!"), 100);
        } else if (stepsleft === 0) {
            socket.emit('endTurn');
        }
    }
});

document.getElementById("solvebutton").onclick = function () {
    if (!isTurn) return alert("Guess only on your turn!");
    
    if (!answer) {
        alert("Game not started yet!");
        return;
    }
    
    let gSuspect = prompt("Killer?");
    if (!gSuspect) return;
    
    let gWeapon = prompt("Weapon?");
    if (!gWeapon) return;
    
    let gRoom = prompt("Room?");
    if (!gRoom) return;
    
    if (gSuspect.toLowerCase() === answer.suspect.toLowerCase() &&
        gWeapon.toLowerCase() === answer.weapon.toLowerCase() &&
        gRoom.toLowerCase() === answer.room.toLowerCase()) {
        alert("You won!");
        location.reload();
    } else {
        alert(`Wrong! Answer: ${answer.suspect}, ${answer.weapon}, ${answer.room}`);
    }
};

render();
