const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { Game, UNIT_STATS } = require('./battle-logic'); 

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

let matches = {}; // { matchId: { id, name, players: [{id, socket, side, ready, unitsSetup, name}], gameState, gameStarted, host } }
let nextMatchId = 1;
const MAX_UNITS_PER_PLAYER = 5;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('getMatches', () => {
        const availableMatches = Object.values(matches)
            .filter(match => match.players.length < 2 && !match.gameStarted)
            .map(match => ({ id: match.id, name: match.name, playerCount: match.players.length }));
        socket.emit('matchList', availableMatches);
    });

    socket.on('createMatch', (matchName) => {
        const matchId = `match-${nextMatchId++}`;
        const creatorName = `Player 1`; // Người tạo luôn là Player 1 (side 0)
        matches[matchId] = {
            id: matchId,
            name: matchName || `Trận ${nextMatchId -1}`,
            players: [{ id: socket.id, socket: socket, side: 0, ready: false, unitsSetup: [], name: creatorName }],
            gameState: null,
            gameStarted: false,
            host: socket.id
        };
        socket.join(matchId);

        socket.emit('matchCreated', {
            matchId,
            side: 0,
            matchName: matches[matchId].name
        });

        socket.emit('navigateToSetup', {
            matchId,
            matchName: matches[matchId].name,
            players: matches[matchId].players.map(p => ({ id: p.id, side: p.side, name: p.name, ready: p.ready }))
        });

        broadcastMatchList();
        console.log(`Match created: "${matches[matchId].name}" (ID: ${matchId}) by ${socket.id}. Creator sent to setup.`);
    });

    socket.on('joinMatch', (matchId) => {
        const match = matches[matchId];
        if (match && match.players.length < 2 && !match.gameStarted) {
            const newPlayerSide = match.players[0].side === 0 ? 1 : 0;
            const newPlayerName = `Player ${newPlayerSide + 1}`;
            const newPlayer = { id: socket.id, socket: socket, side: newPlayerSide, ready: false, unitsSetup: [], name: newPlayerName };
            match.players.push(newPlayer);
            socket.join(matchId);

            socket.emit('joinedMatch', {
                matchId,
                side: newPlayerSide,
                matchName: match.name
            });

            socket.emit('navigateToSetup', {
                matchId,
                matchName: match.name,
                players: match.players.map(p => ({ id: p.id, side: p.side, name: p.name, ready: p.ready }))
            });

            const creator = match.players.find(p => p.id !== socket.id);
            if (creator) {
                io.to(creator.id).emit('opponentJoinedSetup', {
                    opponent: { id: newPlayer.id, side: newPlayer.side, name: newPlayer.name, ready: newPlayer.ready },
                    players: match.players.map(p => ({ id: p.id, side: p.side, name: p.name, ready: p.ready }))
                });
            }

            console.log(`${socket.id} (${newPlayerName}) joined "${match.name}" (ID: ${matchId}). Sent to setup.`);
            broadcastMatchList();
        } else {
            socket.emit('joinError', 'Trận không tồn tại, đã đầy hoặc đã bắt đầu.');
        }
    });

    socket.on('ready', (data) => { // data: { matchId, units: ['Tanker', ...] }
        const match = matches[data.matchId];
        if (!match || match.gameStarted) {
            socket.emit('setupError', 'Trận không hợp lệ hoặc đã bắt đầu.');
            return;
        }

        const player = match.players.find(p => p.id === socket.id);
        if (player) {
            if (data.units.length !== MAX_UNITS_PER_PLAYER) {
                socket.emit('setupError', `Phải chọn đủ ${MAX_UNITS_PER_PLAYER} quân.`);
                return;
            }
            player.ready = true;
            player.unitsSetup = data.units;
            console.log(`${player.name} (ID: ${socket.id}) in match "${match.name}" is ready.`);

            const otherPlayer = match.players.find(p => p.id !== socket.id);
            if (otherPlayer) {
                io.to(otherPlayer.id).emit('playerReadyUpdate', { playerId: socket.id, playerName: player.name, isReady: true });
            }

            const allReady = match.players.every(p => p.ready);
            if (allReady && match.players.length === 2) {
                console.log(`Both players ready in "${match.name}". Starting game.`);
                match.gameStarted = true;
                match.gameState = new Game();

                match.players.forEach((p_loop) => {
                    const side = p_loop.side;
                    const unitRow = side === 0 ? 1 : 9;
                    const startCol = Math.floor((11 - MAX_UNITS_PER_PLAYER) / 2) ;

                    p_loop.unitsSetup.forEach((unitType, index) => {
                        const unitId = `unit-${side}-${index}`;
                        match.gameState.addInitialUnit({
                            id: unitId,
                            type: unitType,
                            x: startCol + index,
                            y: unitRow,
                            owner: side,
                        });
                    });
                });

                match.gameState.startNewRound();
                io.to(data.matchId).emit('battleStart', match.gameState.getState());
                broadcastMatchList();
            }
        } else {
            socket.emit('setupError', 'Không tìm thấy người chơi trong trận.');
        }
    });

    function handleActionAndRespond(matchId, actingSocketId, actionPromise) {
        actionPromise.then(result => {
            const match = matches[matchId];
            if (!match || !match.gameState) return;

            if (result.success) {
                io.to(matchId).emit('gameStateUpdate', match.gameState.getState());
                if (result.gameOver) {
                    io.to(matchId).emit('gameOver', { winner: result.winner, reason: result.winReason || "Trận đấu kết thúc." });
                    cleanupMatch(matchId);
                }
            } else {
                const playerSocket = io.sockets.sockets.get(actingSocketId); // Lấy socket của người gửi request
                if (playerSocket) {
                    playerSocket.emit('actionError', result.message);
                } else {
                    console.warn(`Could not find socket for ID ${actingSocketId} to send actionError.`);
                }
            }
        }).catch(error => {
            console.error("Error processing action:", error);
            const playerSocket = io.sockets.sockets.get(actingSocketId);
            if (playerSocket) {
                playerSocket.emit('actionError', "Lỗi server khi xử lý hành động.");
            }
        });
    }

    socket.on('move', (data) => {
        const match = matches[data.matchId];
        if (!match || !match.gameState || !match.gameStarted) return socket.emit('actionError', 'Trận đấu chưa kích hoạt.');
        const player = match.players.find(p => p.id === socket.id);
        if (!player) return socket.emit('actionError', 'Không tìm thấy người chơi trong trận.');

        const actionPromise = Promise.resolve(
            match.gameState.moveUnit(data.unitId, data.targetCol, data.targetRow, player.side)
        );
        handleActionAndRespond(data.matchId, socket.id, actionPromise);
    });

    socket.on('attack', (data) => {
        const match = matches[data.matchId];
        if (!match || !match.gameState || !match.gameStarted) return socket.emit('actionError', 'Trận đấu chưa kích hoạt.');
        const player = match.players.find(p => p.id === socket.id);
        if (!player) return socket.emit('actionError', 'Không tìm thấy người chơi trong trận.');

        const actionPromise = Promise.resolve(
            match.gameState.attackUnit(data.attackerId, data.targetId, player.side)
        );
        handleActionAndRespond(data.matchId, socket.id, actionPromise);
    });

    socket.on('finishUnitAction', (data) => { // data: { matchId, unitId }
        const match = matches[data.matchId];
        if (!match || !match.gameState || !match.gameStarted) return socket.emit('actionError', 'Trận đấu chưa kích hoạt.');
        const player = match.players.find(p => p.id === socket.id);
        if (!player) return socket.emit('actionError', 'Không tìm thấy người chơi.');

        const unitToFinish = match.gameState.getUnitById(data.unitId);
        if (!unitToFinish || unitToFinish.owner !== player.side) {
            return socket.emit('actionError', 'Không thể kết thúc hành động cho quân này.');
        }
        if (unitToFinish.id !== match.gameState.activeUnitId) {
            return socket.emit('actionError', 'Đây không phải là quân đang được kích hoạt.');
        }

        const actionPromise = Promise.resolve(
            match.gameState.requestFinishUnitAction(data.unitId)
        );
        handleActionAndRespond(data.matchId, socket.id, actionPromise);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const matchId in matches) {
            const match = matches[matchId];
            const playerIndex = match.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const disconnectedPlayer = match.players.splice(playerIndex, 1)[0];
                console.log(`${disconnectedPlayer.name || 'Player'} (ID: ${socket.id}, side ${disconnectedPlayer.side}) removed from match "${match.name}".`);

                if (match.gameStarted && match.gameState && match.gameState.winner === null) {
                    if (match.players.length > 0) {
                        const winnerSide = match.players[0].side;
                        const winnerName = match.players[0].name;
                        io.to(matchId).emit('gameOver', { winner: winnerSide, reason: `${disconnectedPlayer.name || 'Đối thủ'} đã ngắt kết nối. ${winnerName || 'Bạn'} thắng!` });
                    }
                    cleanupMatch(matchId);
                } else if (!match.gameStarted && match.players.length === 1) {
                    const remainingPlayer = match.players[0];
                    remainingPlayer.ready = false;
                    io.to(remainingPlayer.id).emit('opponentLeftSetup', {
                        matchId: match.id,
                        matchName: match.name,
                        remainingPlayerInfo: { id: remainingPlayer.id, name: remainingPlayer.name, ready: remainingPlayer.ready }
                    });
                    console.log(`Match "${match.name}" back to 1 player in setup. Waiting for new opponent.`);
                } else if (match.players.length === 0) {
                    console.log(`Match "${match.name}" is empty, cleaning up.`);
                    cleanupMatch(matchId);
                }
                broadcastMatchList();
                break;
            }
        }
    });

    function broadcastMatchList() {
        const availableMatches = Object.values(matches)
            .filter(m => m.players.length < 2 && !m.gameStarted)
            .map(m => ({ id: m.id, name: m.name, playerCount: m.players.length }));
        io.emit('matchListUpdate', availableMatches);
    }

    function cleanupMatch(matchId) {
        if (matches[matchId]) {
            delete matches[matchId];
            broadcastMatchList();
            console.log(`Match ${matchId} cleaned up and removed.`);
        }
    }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
    console.log(`Game server is running. Access from LAN via your computer's local IP at port ${PORT}.`);
    console.log("(Find your local IP using 'ipconfig' on Windows or 'ifconfig'/'ip addr' on Linux/macOS)");
});