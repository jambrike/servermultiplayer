const socket = io('https://cleuro-game.onrender.com');

// --- Initialization & Auth ---
const username = localStorage.getItem('username');
if (!username) {
    window.location.href = 'login.html';
}

console.log(`Playing as: ${username}`);

let mySocketId = null;
let isTurn = false;
let rollCount = 0;
let stepsleft = 0;
const otherPlayers = {}; // Stores { socketId: { x, y, username } }

// --- Game Constants ---
const suspects = ["Janitor", "Aunt", "Chef", "James", "Butler", "Grandfather"];
const weapons = ["knife", "candlestick", "revolver", "wrench", "rope"];
const rooms = ["kitchen", "ballroom", "conservatory", "library", "study"];

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const answer = {
    suspect: randomFrom(suspects),
    weapons: randomFrom(weapons),
    room: randomFrom(rooms)
};

const rows = 18;
const cols = 18;
const gameArea = document.getElementById("game");

const roomTiles = {
    kitchen: {
        x: 0, y: 0, w: 4, h: 4, type: "kitchen", doors: [{ x: 3, y: 3 }],
        spots: [{ x: 1, y: 1, name: "bin" }, { x: 2, y: 3, name: "rug" }, { x: 0, y: 2, name: "drawer" }]
    },
    ballroom: {
        x: 6, y: 0, w: 6, h: 5, type: "room", doors: [{ x: 6, y: 4 }, { x: 11, y: 4 }],
        spots: [{ x: 7, y: 1, name: "bin" }, { x: 10, y: 3, name: "rug" }, { x: 8, y: 0, name: "drawer" }]
    },
    conservatory: {
        x: 13, y: 0, w: 5, h: 4, type: "study", doors: [{ x: 13, y: 3 }],
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

// --- Clue Setup ---
const roompool = Object.keys(roomTiles);
const shuffledRooms = roompool.sort(() => 0.5 - Math.random());
const cluelocations = {
    suspect: {
        roomKey: shuffledRooms[0], spot: randomFrom(roomTiles[shuffledRooms[0]].spots).name,
        sub: `this is ${answer.suspect} item and it has blood stains`
    },
    weapon: {
        roomKey: shuffledRooms[1], spot: randomFrom(roomTiles[shuffledRooms[1]].spots).name,
        sub: `Its the ${answer.weapons}`
    },
    room: {
        roomKey: shuffledRooms[2], spot: randomFrom(roomTiles[shuffledRooms[2]].spots).name,
        sub: `Theres some blood in here.`
    },
};

const player = { x: 9, y: 9 };

// --- Socket Listeners ---
socket.on('connect', () => {
    mySocketId = socket.id;
});

socket.on('diceRolled', (data) => {
    let steps = data.d1 + data.d2;
    stepsleft += steps;
    rollCount++;
    document.getElementById("stepsleft").textContent = stepsleft;
    document.getElementById("clue-text").textContent = `You rolled a ${steps}. Move!`;
    document.getElementById("clue-text").style.color = "#4CAF50";
});

socket.on('turnUpdate', (data) => {
    isTurn = (data.activePlayerId === mySocketId);
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
    if (data.socketId !== mySocketId) {
        otherPlayers[data.socketId] = data;
        render();
    }
});

// --- Core Functions ---
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

function render() {
    gameArea.innerHTML = "";
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            let cell = document.createElement("div");
            cell.className = "cell";
            let room = RoomAt(x, y);

            // Door detection
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

            // Render Local Player
            if (player.x === x && player.y === y) {
                let token = document.createElement("div");
                token.className = "player-token local"; // Add CSS for .local { background: red; }
                token.style.cssText = "width:20px;height:20px;background:red;border-radius:50%;margin:5px;box-shadow:0 0 5px #000;";
                cell.appendChild(token);
            }

            // Render Other Players
            for (let id in otherPlayers) {
                let p = otherPlayers[id];
                if (p.x === x && p.y === y) {
                    let oToken = document.createElement("div");
                    oToken.style.cssText = "width:20px;height:20px;background:purple;border-radius:50%;margin:5px;box-shadow:0 0 5px #000;";
                    oToken.title = p.username;
                    cell.appendChild(oToken);
                }
            }
            gameArea.appendChild(cell);
        }
    }
}

// --- Event Handlers ---
document.getElementById("rolldice").onclick = () => {
    if (!isTurn) return alert("Not your turn!");
    socket.send(JSON.stringify({ type: 'rolldice' }));
};

document.addEventListener("keydown", e => {
    if (stepsleft <= 0) return;
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

        socket.emit('playerinfo', { x: player.x, y: player.y, username });

        let nowInRoom = RoomAt(nx, ny);
        render();

        if (nowInRoom && !wasInRoom) {
            stepsleft = 0;
            document.getElementById("stepsleft").textContent = 0;
            setTimeout(() => alert("Search the " + nowInRoom.type + " for clues!"), 100);
        }
    }
});

document.getElementById("solvebutton").onclick = function () {
    if (!isTurn) return alert("Guess only on your turn!");
    let gSuspect = prompt("Killer?");
    let gWeapon = prompt("Weapon?");
    let gRoom = prompt("Room?");
    if (gSuspect && gWeapon && gRoom && 
        gSuspect.toLowerCase() === answer.suspect.toLowerCase() && 
        gWeapon.toLowerCase() === answer.weapons.toLowerCase() && 
        gRoom.toLowerCase() === answer.room.toLowerCase()) {
        alert("You won!");
        location.reload();
    } else {
        alert(`Wrong! Answer: ${answer.suspect}, ${answer.weapons}, ${answer.room}`);
    }
};

render();