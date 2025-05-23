const socket = io();

// --- DOM Elements ---
const lobbyView = document.getElementById('lobby-view');
const createMatchButton = document.getElementById('create-match-btn');
const matchNameInput = document.getElementById('match-name-input');
const matchesListDiv = document.getElementById('matches-list');
const lobbyStatus = document.getElementById('lobby-status');

const setupView = document.getElementById('setup-view');
const setupTitle = document.getElementById('setup-title');
const setupMatchNameSpan = document.getElementById('setup-match-name');
const playerSideIndicatorSetup = document.getElementById('player-side-indicator-setup');
const unitSelectionOptionsDiv = document.getElementById('unit-selection-options');
const chosenUnitsListUl = document.getElementById('chosen-units-list');
const readyButton = document.getElementById('ready-btn');
const setupStatusOpponent = document.getElementById('setup-status-opponent');
const setupStatusSelf = document.getElementById('setup-status-self');
const maxUnitsIndicator = document.getElementById('max-units-indicator');

const battleView = document.getElementById('battle-view');
const battleTitle = document.getElementById('battle-title');
const battleMatchNameSpan = document.getElementById('battle-match-name');
const playerSideIndicatorBattle = document.getElementById('player-side-indicator-battle');
const turnIndicator = document.getElementById('turn-indicator'); // Sẽ hiển thị thông tin quân active
const gameCanvasContainer = document.getElementById('game-canvas-container');
const finishActionButton = document.getElementById('end-turn-btn'); // Nút "Hoàn Thành Hành Động"
const skipUnitActionButton = document.getElementById('skip-unit-action-btn'); // Nút "Bỏ Qua Lượt"

// --- Game State Variables ---
let currentMatchId = null;
let playerSide = null; // 0 or 1
let currentView = 'lobby';
let selectedUnitsForSetup = [];
const MAX_UNITS = 5;
maxUnitsIndicator.textContent = MAX_UNITS;
let p5Instance = null;
let currentMatchName = "";
let currentActiveUnitIdClient = null; // Client cũng theo dõi unit nào đang active

// --- UI Switching Logic ---
function showView(viewName) {
    lobbyView.style.display = 'none';
    setupView.style.display = 'none';
    battleView.style.display = 'none';

    if (viewName === 'lobby') lobbyView.style.display = 'block';
    else if (viewName === 'setup') setupView.style.display = 'block';
    else if (viewName === 'battle') battleView.style.display = 'block';
    currentView = viewName;
}

// --- Lobby Logic ---
// ... (Giữ nguyên logic Lobby: createMatchButton, displayMatches, socket.on('matchList'...), 'matchCreated', 'joinedMatch', 'playerJoined', 'joinError') ...
createMatchButton.addEventListener('click', () => {
    const matchName = matchNameInput.value.trim();
    socket.emit('createMatch', matchName);
    lobbyStatus.textContent = 'Đang tạo trận...';
});

function displayMatches(matches) {
    matchesListDiv.innerHTML = '';
    if (matches.length === 0) {
        matchesListDiv.innerHTML = '<p>Không có trận nào đang chờ. Hãy tạo một trận!</p>';
        return;
    }
    matches.forEach(match => {
        const matchElement = document.createElement('li');
        matchElement.classList.add('match-item');
        matchElement.innerHTML = `
            <span>${match.name} (${match.playerCount}/2)</span>
            <button class="join-btn" data-match-id="${match.id}">Tham Gia</button>
        `;
        matchElement.querySelector('.join-btn').addEventListener('click', () => {
            socket.emit('joinMatch', match.id);
            lobbyStatus.textContent = `Đang tham gia trận ${match.name}...`;
        });
        matchesListDiv.appendChild(matchElement);
    });
}
socket.on('matchList', (matches) => { displayMatches(matches); });
socket.on('matchListUpdate', (matches) => { if (currentView === 'lobby') { displayMatches(matches); } });
socket.on('matchCreated', (data) => {
    currentMatchId = data.matchId; playerSide = data.side; currentMatchName = data.matchName;
    lobbyStatus.textContent = `Đã tạo trận "${currentMatchName}". Bạn là Người chơi ${playerSide + 1}. Đang chờ đối thủ...`;
});
socket.on('joinedMatch', (data) => {
    currentMatchId = data.matchId; playerSide = data.side; currentMatchName = data.matchName;
    lobbyStatus.textContent = `Đã tham gia trận "${currentMatchName}". Bạn là Người chơi ${playerSide + 1}.`;
});
socket.on('playerJoined', (data) => {
    if (currentView === 'lobby' || currentMatchId) {
         lobbyStatus.textContent = `Đối thủ (${data.playerName}) đã tham gia trận "${currentMatchName}". Chuẩn bị...`;
    }
});
socket.on('joinError', (message) => {
    alert(`Lỗi Tham Gia Trận: ${message}`); lobbyStatus.textContent = ''; socket.emit('getMatches');
});


// --- Setup Logic ---
// ... (Giữ nguyên logic Setup: navigateToSetup, unit selection, readyButton, playerReadyUpdate, setupError) ...
socket.on('navigateToSetup', (data) => {
    if (data.matchId === currentMatchId) {
        showView('setup');
        setupMatchNameSpan.textContent = currentMatchName;
        playerSideIndicatorSetup.textContent = `${playerSide + 1} (Phe ${playerSide})`;
        selectedUnitsForSetup = []; updateChosenUnitsDisplay();
        setupStatusOpponent.textContent = "Trạng thái đối thủ: Đang chờ...";
        setupStatusSelf.textContent = "Trạng thái của bạn: Chưa sẵn sàng";
        readyButton.disabled = true; readyButton.textContent = "Sẵn Sàng";
         document.querySelectorAll('.unit-select-btn').forEach(btn => btn.disabled = false);
    }
});
document.querySelectorAll('.unit-select-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        if (selectedUnitsForSetup.length < MAX_UNITS) {
            selectedUnitsForSetup.push(e.target.dataset.type);
            updateChosenUnitsDisplay();
        }
        if (selectedUnitsForSetup.length === MAX_UNITS) {
            document.querySelectorAll('.unit-select-btn').forEach(btn => btn.disabled = true);
        }
    });
});
function updateChosenUnitsDisplay() {
    chosenUnitsListUl.innerHTML = '';
    selectedUnitsForSetup.forEach((unitType, index) => {
        const li = document.createElement('li');
        li.textContent = unitType;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Xóa'; removeBtn.classList.add('remove-unit-btn');
        removeBtn.onclick = () => {
            selectedUnitsForSetup.splice(index, 1); updateChosenUnitsDisplay();
            document.querySelectorAll('.unit-select-btn').forEach(btn => btn.disabled = false);
        };
        li.appendChild(removeBtn); chosenUnitsListUl.appendChild(li);
    });
    readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS;
}
readyButton.addEventListener('click', () => {
    if (selectedUnitsForSetup.length === MAX_UNITS) {
        socket.emit('ready', { matchId: currentMatchId, units: selectedUnitsForSetup });
        readyButton.disabled = true; readyButton.textContent = 'Đang chờ đối thủ...';
        setupStatusSelf.textContent = "Trạng thái của bạn: ĐÃ SẴN SÀNG";
    }
});
socket.on('playerReadyUpdate', (data) => {
    if (data.playerId !== socket.id) {
        setupStatusOpponent.textContent = data.isReady ? "Trạng thái đối thủ: ĐÃ SẴN SÀNG" : "Trạng thái đối thủ: Đang chờ...";
    }
});
socket.on('setupError', (message) => {
    alert(`Lỗi Thiết Lập: ${message}`);
    readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS;
    readyButton.textContent = 'Sẵn Sàng';
    setupStatusSelf.textContent = "Trạng thái của bạn: Chưa sẵn sàng";
});


// --- Battle Logic ---
function updateBattleUI(gameState) {
    if (!gameState) {
        finishActionButton.disabled = true;
        skipUnitActionButton.disabled = true; // Vô hiệu hóa nút mới
        turnIndicator.textContent = "Đang chờ...";
        return;
    }
    currentActiveUnitIdClient = gameState.activeUnitId;

    const activeUnit = gameState.units.find(u => u.id === gameState.activeUnitId);
    // Lấy trạng thái hành động của quân active từ server
    const activeUnitState = gameState.activeUnitId ? gameState.activeUnitActionState : null;

    if (activeUnit) {
        turnIndicator.innerHTML = `Lượt của: <strong style="color:${activeUnit.owner === playerSide ? 'mediumseagreen' : 'tomato'}">${activeUnit.type} (ID:...${activeUnit.id.slice(-2)})</strong> (Đội ${activeUnit.owner + 1})`;

        const isMyUnitActive = activeUnit.owner === playerSide;
        let canManuallyFinish = false;
        let canSkip = false;

        if (isMyUnitActive && activeUnitState) {
            if (!activeUnitState.attacked) { // Chỉ có thể tương tác nếu quân chưa tấn công (vì tấn công tự kết thúc)
                // Có thể "Bỏ Qua" nếu chưa làm gì cả (chưa di chuyển VÀ chưa tấn công)
                if (!activeUnitState.moved) {
                    canSkip = true;
                }
                // Có thể "Hoàn thành Hành Động" nếu đã di chuyển và chưa tấn công
                // (Server sẽ tự kết thúc nếu di chuyển mà không còn mục tiêu tấn công)
                // Nút này hữu ích nếu sau khi di chuyển, CÓ mục tiêu, nhưng người chơi KHÔNG MUỐN tấn công.
                if (activeUnitState.moved) {
                    canManuallyFinish = true;
                }
            }
        }

        finishActionButton.disabled = !canManuallyFinish;
        finishActionButton.textContent = canManuallyFinish ? `Xong (${activeUnit.type})` : "Hoàn thành";

        skipUnitActionButton.disabled = !canSkip;
        skipUnitActionButton.textContent = canSkip ? `Bỏ lượt (${activeUnit.type})` : "Bỏ Qua Lượt";

    } else if (gameState.winner !== null) {
        turnIndicator.textContent = "TRẬN ĐẤU KẾT THÚC!";
        finishActionButton.disabled = true;
        skipUnitActionButton.disabled = true;
    } else {
        turnIndicator.textContent = "Đang chờ quân tiếp theo...";
        finishActionButton.disabled = true;
        skipUnitActionButton.disabled = true;
    }

    if (p5Instance && typeof p5Instance.setActiveUnitId === 'function') {
        p5Instance.setActiveUnitId(gameState.activeUnitId, activeUnit ? activeUnit.owner : -1);
    }
}


socket.on('battleStart', (initialGameState) => {
    console.log('Battle starting!', initialGameState);
    showView('battle');
    battleMatchNameSpan.textContent = currentMatchName;
    playerSideIndicatorBattle.textContent = `${playerSide + 1} (Phe ${playerSide})`;
    // finishActionButton.textContent = "Hoàn thành Hành Động"; // Sẽ được set trong updateBattleUI


    if (!p5Instance) {
        p5Instance = new p5(sketchFunction, gameCanvasContainer);
         // Thêm hàm để p5Instance có thể lấy trạng thái game hiện tại nếu sketch.js cần
        if(p5Instance) {
            p5Instance.getCurrentGameState = function() { return currentGameStateForSketch; }
        }
    }
    // Cập nhật currentGameStateForSketch mà p5Instance sẽ dùng
    currentGameStateForSketch = initialGameState;

    if (p5Instance && typeof p5Instance.setupGameBoard === 'function') {
        p5Instance.setupGameBoard(initialGameState, playerSide);
    }
    updateBattleUI(initialGameState);
});

let currentGameStateForSketch = null;

socket.on('gameStateUpdate', (gameState) => {
    console.log('Game state updated:', gameState);
    currentGameStateForSketch = gameState; // Cập nhật state cho sketch
    if (p5Instance && currentView === 'battle' && typeof p5Instance.updateGameState === 'function') {
        p5Instance.updateGameState(gameState);
    }
    updateBattleUI(gameState);

    if (gameState.winner !== null && gameState.winner !== undefined) {
        // handleGameOver sẽ được gọi bởi sự kiện 'gameOver' riêng
    }
});

finishActionButton.addEventListener('click', () => {
    if (currentMatchId && currentActiveUnitIdClient) {
        const activeUnitInGameState = currentGameStateForSketch?.units.find(u => u.id === currentActiveUnitIdClient);
        if (activeUnitInGameState && activeUnitInGameState.owner === playerSide) {
            // Chỉ gửi nếu quân đã di chuyển và chưa tấn công (theo logic của canManuallyFinish)
            const activeUnitState = currentGameStateForSketch?.activeUnitActionState;
            if (activeUnitState && activeUnitState.moved && !activeUnitState.attacked) {
                console.log(`Client: Requesting finish action for unit ${currentActiveUnitIdClient} after move.`);
                socket.emit('finishUnitAction', { matchId: currentMatchId, unitId: currentActiveUnitIdClient });
                finishActionButton.disabled = true;
                skipUnitActionButton.disabled = true;
            } else {
                 console.warn("Finish action button clicked in inappropriate state.");
            }
        } else {
            console.warn("Cannot finish action: not your unit's turn or no active unit identified by client.");
        }
    }
});

skipUnitActionButton.addEventListener('click', () => {
    if (currentMatchId && currentActiveUnitIdClient) {
        const activeUnitInGameState = currentGameStateForSketch?.units.find(u => u.id === currentActiveUnitIdClient);
        if (activeUnitInGameState && activeUnitInGameState.owner === playerSide) {
            // Chỉ gửi nếu quân chưa làm gì cả (theo logic của canSkip)
             const activeUnitState = currentGameStateForSketch?.activeUnitActionState;
            if (activeUnitState && !activeUnitState.moved && !activeUnitState.attacked) {
                console.log(`Client: Requesting skip action for unit ${currentActiveUnitIdClient}.`);
                socket.emit('finishUnitAction', { matchId: currentMatchId, unitId: currentActiveUnitIdClient });
                finishActionButton.disabled = true;
                skipUnitActionButton.disabled = true;
            } else {
                console.warn("Skip action button clicked in inappropriate state.");
            }
        } else {
            console.warn("Cannot skip action: not your unit's turn or no active unit.");
        }
    }
});

// --- Functions for p5.js to call (exposed on window) ---
window.attemptMove = function(unitId, targetRow, targetCol) {
    if (unitId !== currentActiveUnitIdClient) {
        alert("Không phải lượt của quân này để di chuyển!"); return;
    }
    socket.emit('move', { matchId: currentMatchId, unitId, targetRow, targetCol });
}

window.attemptAttack = function(attackerId, targetId) {
    if (attackerId !== currentActiveUnitIdClient) {
        alert("Không phải lượt của quân này để tấn công!"); return;
    }
    socket.emit('attack', { matchId: currentMatchId, attackerId, targetId });
}
// ---------------------------------------------------------

socket.on('actionError', (message) => {
    alert(`Lỗi Hành Động: ${message}`);
    // Kích hoạt lại nút nếu cần, dựa trên trạng thái game mới nhất có thể được gửi sau lỗi
    // Hoặc đợi gameStateUpdate tiếp theo để cập nhật UI chính xác
    const latestGameState = p5Instance?.getCurrentGameState();
    if(latestGameState) updateBattleUI(latestGameState);
});

function handleGameOver(data) {
    if (currentView !== 'battle' && currentView !== 'setup') return;

    let message = `Trận đấu kết thúc! ${data.reason || ''}\n`;
    if (data.winner === playerSide) {
        message += "BẠN THẮNG!";
    } else if (data.winner !== null && data.winner !== undefined) {
        message += "BẠN THUA!";
    } else {
        message += "Trận đấu hòa (hoặc kết thúc không rõ ràng).";
    }
    alert(message);
    resetClientStateForNewGame();
}
socket.on('gameOver', handleGameOver);

socket.on('opponentLeftSetup', (data) => {
    if (currentMatchId === data.matchId && currentView === 'setup') {
        alert('Đối thủ đã rời khỏi trận trong lúc thiết lập!');
        lobbyStatus.textContent = `Đối thủ đã rời trận "${data.name}". Bạn đã quay lại sảnh.`;
        if (data.remainingPlayerId === socket.id) { // Nếu mình là người còn lại
            // Cần reset trạng thái ready của mình nếu mình là host và đối thủ rời
            setupStatusSelf.textContent = "Trạng thái của bạn: Chưa sẵn sàng";
            readyButton.disabled = selectedUnitsForSetup.length !== MAX_UNITS;
            readyButton.textContent = "Sẵn Sàng";
        }
        // Chuyển về lobby nếu mình không phải host hoặc để đảm bảo
        showView('lobby');
        socket.emit('getMatches');
        // Không reset client state hoàn toàn nếu chỉ là setup và 1 người rời, người host có thể chờ người khác
        // Chỉ reset nếu trận bị hủy hoàn toàn hoặc game over.
        // Tuy nhiên, để đơn giản, có thể reset luôn:
        // resetClientStateForNewGame();
    }
});

function resetClientStateForNewGame() {
    showView('lobby');
    if (p5Instance && typeof p5Instance.resetGame === 'function') {
        p5Instance.resetGame();
    }
    currentMatchId = null;
    playerSide = null;
    selectedUnitsForSetup = [];
    currentMatchName = "";
    currentActiveUnitIdClient = null;
    lobbyStatus.textContent = "";
    socket.emit('getMatches');
}

socket.on('disconnect', (reason) => {
    if (currentView !== 'lobby') { // Chỉ alert nếu đang không ở lobby
        alert(`Mất kết nối với server: ${reason}. Trở về sảnh chờ.`);
    }
    resetClientStateForNewGame(); // Reset về trạng thái ban đầu
});

// Initialize
showView('lobby');
socket.emit('getMatches');

// Thêm hàm để p5Instance có thể lấy trạng thái game hiện tại (nếu cần)
// Điều này hữu ích để sketch.js có thể truy cập gameState mà không cần truyền qua lại quá nhiều
if(p5Instance) { // p5Instance có thể chưa được khởi tạo ngay
    p5Instance.getCurrentGameState = function() { return currentGameState; }
} else {
    // Nếu p5Instance chưa có, tạo 1 placeholder để tránh lỗi, nó sẽ được ghi đè
    // Hoặc sketch.js sẽ tự quản lý tham chiếu đến currentGameState được update.
    // Cách tốt hơn là client.js truyền gameState vào các hàm của sketch.js khi cần.
}