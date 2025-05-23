// public/sketch.js

const sketchFunction = (p) => {
    const TILE_SIZE = 45;
    const BOARD_COLS = 11;
    const BOARD_ROWS = 11;
    let currentGameState = null;
    let localPlayerSide = -1; // Phe của người chơi cục bộ (0 hoặc 1)

    let selectedUnitId = null;  // ID của quân cờ đang được người chơi CHỌN trên bản đồ
    let possibleMoves = [];     // Các ô có thể di chuyển tới của quân đang chọn
    let possibleAttacks = [];   // Các quân địch có thể tấn công của quân đang chọn

    // Thông tin về quân cờ đang được kích hoạt lượt đi (active)
    let currentActiveUnitIdSketch = null;
    let currentActiveUnitOwnerSketch = -1; // Chủ sở hữu của quân đang active

    // Biến cho hiệu ứng nhấp nháy viền quân active
    let blinkFrameCounter = 0;
    const BLINK_ON_DURATION = 25;
    const BLINK_OFF_DURATION = 20;
    const BLINK_CYCLE_TOTAL = BLINK_ON_DURATION + BLINK_OFF_DURATION;
    let isActiveBlinkStrong = true;

    // Đối tượng lưu trữ các hình ảnh đã tải
    const unitImages = {
        TANKER: { blue: null, red: null },
        RANGER: { blue: null, red: null },
        ASSASIN: { blue: null, red: null }, 
        BASE: { blue: null, red: null }
    };

    // Đường dẫn đến các file hình ảnh (trong thư mục public/imgs/)
    const unitImagePaths = {
        TANKER: { blue: 'imgs/tanker_blue.png', red: 'imgs/tanker_red.png' },
        RANGER: { blue: 'imgs/ranger_blue.png', red: 'imgs/ranger_red.png' },
        ASSASIN: { blue: 'imgs/assasin_blue.png', red: 'imgs/assasin_red.png' }, 
        BASE: { blue: 'imgs/base_blue.png', red: 'imgs/base_red.png' }
    };

    // Hàm preload để tải tài nguyên trước khi setup được gọi
    p.preload = function() {
        console.log("p5: Starting preload...");
        for (const unitType in unitImagePaths) {
            try {
                if (unitImagePaths[unitType].blue) {
                    unitImages[unitType].blue = p.loadImage(unitImagePaths[unitType].blue,
                        () => console.log(`p5: Loaded ${unitImagePaths[unitType].blue}`),
                        (e) => console.error(`p5: Failed to load ${unitImagePaths[unitType].blue}`, e)
                    );
                }
                if (unitImagePaths[unitType].red) {
                    unitImages[unitType].red = p.loadImage(unitImagePaths[unitType].red,
                        () => console.log(`p5: Loaded ${unitImagePaths[unitType].red}`),
                        (e) => console.error(`p5: Failed to load ${unitImagePaths[unitType].red}`, e)
                    );
                }
            } catch (error) {
                console.error(`p5: Error initiating load for ${unitType}:`, error);
            }
        }
        console.log("p5: Preload function finished queueing loads.");
    };

    p.setup = function () {
        p.createCanvas(BOARD_COLS * TILE_SIZE, BOARD_ROWS * TILE_SIZE);
        p.textAlign(p.CENTER, p.CENTER);
        p.imageMode(p.CENTER); // Vẽ hình ảnh từ tâm của nó
        console.log("p5: Setup complete. Waiting for game data.");
        // p.noLoop() // Loop sẽ được kiểm soát bởi setupGameBoard và resetGame
    };

    p.setupGameBoard = function (initialState, playerSide) {
        currentGameState = initialState;
        localPlayerSide = playerSide;
        selectedUnitId = null;
        possibleMoves = [];
        possibleAttacks = [];
        blinkFrameCounter = 0;
        isActiveBlinkStrong = true;
        // active unit info sẽ được set qua updateGameState -> setActiveUnitId
        console.log("p5: Game board setup. Player side:", localPlayerSide);
        if (!p.isLooping()) {
            p.loop();
        }
        p.redraw();
    };

    p.updateGameState = function (newState) {
        currentGameState = newState; // Cập nhật state cục bộ
        // Cập nhật quân active dựa trên state mới từ server
        const activeUnitFromServer = newState.units.find(u => u.id === newState.activeUnitId);
        p.setActiveUnitId(newState.activeUnitId, activeUnitFromServer ? activeUnitFromServer.owner : -1);

        if (selectedUnitId) {
            const unit = findUnitById(selectedUnitId);
            if (!unit || unit.owner !== localPlayerSide || unit.hp <= 0 || unit.id !== currentActiveUnitIdSketch) {
                resetSelection();
            } else {
                calculatePossibleActions(unit); // Tính lại actions cho quân đang chọn (nếu nó là active)
            }
        }
        if (p.isLooping()) p.redraw();
    };

    p.setActiveUnitId = function(unitId, owner) {
        const oldActiveUnitId = currentActiveUnitIdSketch;
        currentActiveUnitIdSketch = unitId;
        currentActiveUnitOwnerSketch = owner;

        if (oldActiveUnitId !== unitId) { // Chỉ reset blink nếu active unit thực sự thay đổi
            blinkFrameCounter = 0;
            isActiveBlinkStrong = true;
        }

        if (oldActiveUnitId !== unitId && selectedUnitId && selectedUnitId !== unitId) {
            resetSelection();
        } else if (unitId && owner === localPlayerSide && (!selectedUnitId || selectedUnitId !== unitId)) {
            const activeUnit = findUnitById(unitId);
            if (activeUnit && activeUnit.hp > 0) { // Chỉ chọn nếu quân còn sống
                selectUnit(activeUnit);
            } else {
                resetSelection(); // Nếu quân active đã chết hoặc không tìm thấy, bỏ chọn
            }
        } else if (!unitId) { // Nếu không có quân nào active
            resetSelection();
        }
        if (p.isLooping()) p.redraw();
    };

    p.getActiveUnitId = function() { return currentActiveUnitIdSketch; };
    p.getActiveUnitOwner = function() { return currentActiveUnitOwnerSketch; };

    p.draw = function () {
        if (!currentGameState) { // Nếu chưa có game state, chỉ vẽ nền chờ
            p.background(235);
            p.fill(0);
            p.textSize(20);
            p.text("Đang tải dữ liệu trận đấu...", p.width / 2, p.height / 2);
            return;
        }
        // Cập nhật trạng thái nhấp nháy
        blinkFrameCounter = (blinkFrameCounter + 1) % BLINK_CYCLE_TOTAL;
        isActiveBlinkStrong = blinkFrameCounter < BLINK_ON_DURATION;

        p.background(235);
        drawGrid();
        drawHighlightsForMovesAndAttacks(); // Vẽ highlight ô trước
        drawUnits(); // Vẽ quân cờ, viền và HP bar
    };

    function drawGrid() {
        for (let r_logical = 0; r_logical < BOARD_ROWS; r_logical++) {
            for (let c_grid = 0; c_grid < BOARD_COLS; c_grid++) {
                p.stroke(180); p.strokeWeight(1);
                if ((r_logical + c_grid) % 2 === 0) { p.fill(250, 250, 240); }
                else { p.fill(240, 240, 220); }
                const displayRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - r_logical) : r_logical;
                p.rect(c_grid * TILE_SIZE, displayRow * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    function drawUnits() {
        if (!currentGameState || !currentGameState.units) return;

        currentGameState.units.forEach(unit => {
            if (unit.hp <= 0 && unit.type !== 'Base') return;

            const unitTypeKey = unit.type.toUpperCase(); // Ví dụ: "TANKER", "ASSASIN"
            let imgToDraw = null;

            if (unitImages[unitTypeKey]) {
                imgToDraw = (unit.owner === localPlayerSide) ? unitImages[unitTypeKey].blue : unitImages[unitTypeKey].red;
            }

            const logicalUnitY = unit.y;
            let displayRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - logicalUnitY) : logicalUnitY;
            const displayCol = unit.x;

            const xPos = displayCol * TILE_SIZE + TILE_SIZE / 2;
            const yPos = displayRow * TILE_SIZE + TILE_SIZE / 2;
            const imgDisplaySize = TILE_SIZE * 0.85; // Kích thước hiển thị của hình ảnh

            // 1. Vẽ hình ảnh quân cờ
            if (imgToDraw && imgToDraw.width > 0 && imgToDraw.height > 0) {
                p.image(imgToDraw, xPos, yPos, imgDisplaySize, imgDisplaySize);
            } else {
                // Fallback: Vẽ hình elip và ký hiệu nếu không có hình ảnh hoặc ảnh chưa load xong
                p.push();
                const fallbackColors = { TANKER: [50,50,200], RANGER: [50,200,50], ASSASIN: [200,50,50], BASE: [150,150,150]};
                const fallbackSymbols = { TANKER: 'T', RANGER: 'R', ASSASIN: 'A', BASE: 'B'};
                let color = fallbackColors[unitTypeKey] || [100,100,100];
                let symbol = fallbackSymbols[unitTypeKey] || '?';
                if (unit.owner !== localPlayerSide) color = color.map(c => Math.max(0, c - 40));

                p.fill(color[0], color[1], color[2]);
                p.stroke(30); p.strokeWeight(1);
                p.ellipse(xPos, yPos, TILE_SIZE * 0.70, TILE_SIZE * 0.70); // Ellipse nhỏ hơn chút
                p.fill(255); p.noStroke(); p.textSize(TILE_SIZE * 0.4);
                p.text(symbol, xPos, yPos);
                p.pop();
                // if (!imgToDraw) console.warn(`Image object for ${unitTypeKey} is null.`);
                // else if (imgToDraw.width === 0) console.warn(`Image for ${unitTypeKey} has 0 width (path: ${unitImagePaths[unitTypeKey]?.[unit.owner === localPlayerSide ? 'blue' : 'red']}).`);
            }

            // 2. Vẽ viền highlight (đè lên hình ảnh)
            p.push();
            p.noFill();
            p.rectMode(p.CENTER); // Vẽ viền từ tâm

            if (unit.id === currentActiveUnitIdSketch) {
                if (isActiveBlinkStrong) {
                    p.strokeWeight(3.5);
                    p.stroke(255, 165, 0, 220); // Cam/vàng đậm
                } else {
                    p.strokeWeight(2.5);
                    p.stroke(0, 200, 200, 180); // Xanh lam nhạt
                }
                p.rect(xPos, yPos, imgDisplaySize + 3, imgDisplaySize + 3, 4); // Viền bo tròn nhẹ
            } else if (selectedUnitId === unit.id) {
                p.strokeWeight(3);
                p.stroke(255, 204, 0, 200); // Vàng cho quân được chọn (không active)
                p.rect(xPos, yPos, imgDisplaySize + 3, imgDisplaySize + 3, 4);
            }
            p.pop();
            p.rectMode(p.CORNER); // Reset rectMode

            // 3. Vẽ thanh HP
            if (unit.hp !== undefined && unit.maxHp !== undefined) {
                const hpBarWidth = TILE_SIZE * 0.7;
                const hpBarHeight = 6;
                const hpBarX = xPos - hpBarWidth / 2; // Căn giữa thanh HP với xPos
                const imageVisualRadiusY = imgDisplaySize / 2;
                const imageTopActualY = yPos - imageVisualRadiusY; // Tọa độ Y thực tế của đỉnh ảnh
                const hpBarPadding = 3;
                const hpBarY = imageTopActualY - hpBarHeight - hpBarPadding;

                p.push();
                p.strokeWeight(0.5); p.stroke(30);
                p.fill(80, 80, 80); p.rect(hpBarX, hpBarY, hpBarWidth, hpBarHeight, 2);
                const currentHpWidth = hpBarWidth * (Math.max(0, unit.hp) / unit.maxHp);
                if (unit.owner === localPlayerSide) { p.fill(0, 200, 0); }
                else { p.fill(200, 0, 0); }
                if (currentHpWidth > 0) { p.rect(hpBarX, hpBarY, currentHpWidth, hpBarHeight, 2); }
                p.fill(255); p.noStroke(); p.textSize(hpBarHeight * 1.4); // Chữ nhỏ hơn chút
                p.textAlign(p.CENTER, p.CENTER);
                p.text(`${unit.hp}`, hpBarX + hpBarWidth / 2, hpBarY + hpBarHeight / 2 + 0.5); // Căn chỉnh text
                p.pop();
            }
        });
    }

    function drawHighlightsForMovesAndAttacks() {
        p.noStroke();
        p.rectMode(p.CORNER);
        possibleMoves.forEach(move => {
            const logicalMoveY = move.y;
            let displayRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - logicalMoveY) : logicalMoveY;
            p.fill(0, 255, 0, 65); // Giảm alpha hơn nữa
            p.rect(move.x * TILE_SIZE, displayRow * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        });
        possibleAttacks.forEach(targetInfo => {
            const logicalTargetY = targetInfo.y;
            let displayRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - logicalTargetY) : logicalTargetY;
            p.fill(255, 0, 0, 65); // Giảm alpha hơn nữa
            p.rect(targetInfo.x * TILE_SIZE, displayRow * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        });
    }

    p.mousePressed = function () {
        if (!currentGameState || !p.canvas ||
            p.mouseX < 0 || p.mouseX >= p.width || p.mouseY < 0 || p.mouseY >= p.height) {
            return;
        }

        if (!currentActiveUnitIdSketch || currentActiveUnitOwnerSketch !== localPlayerSide) {
            const canvasClickedRowPre = Math.floor(p.mouseY / TILE_SIZE);
            let clickedLogicRowPre = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - canvasClickedRowPre) : canvasClickedRowPre;
            const clickedLogicColPre = Math.floor(p.mouseX / TILE_SIZE);
            const unitUnderMouse = findUnitAt(clickedLogicColPre, clickedLogicRowPre);

            if (unitUnderMouse && unitUnderMouse.owner === localPlayerSide && unitUnderMouse.id === currentActiveUnitIdSketch && unitUnderMouse.hp > 0) {
                 selectUnit(unitUnderMouse); // Cho phép chọn lại quân active của mình nếu chưa chọn
            } else {
                resetSelection();
            }
            if (p.isLooping()) p.redraw();
            return;
        }

        const canvasClickedRow = Math.floor(p.mouseY / TILE_SIZE);
        let clickedLogicRow = (localPlayerSide === 0) ? (BOARD_ROWS - 1 - canvasClickedRow) : canvasClickedRow;
        const clickedLogicCol = Math.floor(p.mouseX / TILE_SIZE);
        const clickedUnitObject = findUnitAt(clickedLogicCol, clickedLogicRow);

        if (selectedUnitId && selectedUnitId === currentActiveUnitIdSketch) {
            const currentSelectedUnit = findUnitById(selectedUnitId);
            if (!currentSelectedUnit || currentSelectedUnit.hp <= 0) { resetSelection(); if (p.isLooping()) p.redraw(); return; }

            const activeUnitState = currentGameState.activeUnitActionState || { moved: false, attacked: false };
            if (activeUnitState.attacked) {
                if (!clickedUnitObject || clickedUnitObject.id !== selectedUnitId) resetSelection();
                if (p.isLooping()) p.redraw();
                return;
            }

            if (clickedUnitObject && clickedUnitObject.owner !== localPlayerSide && clickedUnitObject.hp > 0) {
                const isAttackable = possibleAttacks.some(atkTarget => atkTarget.id === clickedUnitObject.id);
                if (isAttackable) {
                    window.attemptAttack(selectedUnitId, clickedUnitObject.id); return;
                }
            } else if (!clickedUnitObject && !activeUnitState.moved) {
                const isMovable = possibleMoves.some(move => move.x === clickedLogicCol && move.y === clickedLogicRow);
                if (isMovable) {
                    window.attemptMove(selectedUnitId, clickedLogicRow, clickedLogicCol); return;
                }
            }
            // Nếu click vào ô không hợp lệ (không phải move, không phải attack, không phải chính nó), không bỏ chọn vội
            // để người chơi có thể thử lại. Bỏ chọn nếu click vào quân khác của mình (không phải active unit)
             if (clickedUnitObject && clickedUnitObject.owner === localPlayerSide && clickedUnitObject.id !== selectedUnitId) {
                resetSelection();
            }

        } else {
            if (clickedUnitObject && clickedUnitObject.id === currentActiveUnitIdSketch && clickedUnitObject.owner === localPlayerSide && clickedUnitObject.hp > 0) {
                selectUnit(clickedUnitObject);
            } else {
                resetSelection();
            }
        }
        if (p.isLooping()) p.redraw();
    };

    function selectUnit(unit) {
        if (!unit || unit.id !== currentActiveUnitIdSketch || unit.owner !== localPlayerSide || unit.hp <=0) {
            resetSelection();
            return;
        }
        selectedUnitId = unit.id;
        console.log(`p5: Selected active unit ${unit.type} (ID: ${unit.id})`);
        calculatePossibleActions(unit);
    }

    function resetSelection() {
        if (selectedUnitId !== null) { // Chỉ log nếu có sự thay đổi
             console.log(`p5: Deselected unit ${selectedUnitId}`);
        }
        selectedUnitId = null;
        possibleMoves = [];
        possibleAttacks = [];
    }

    function findUnitAt(col, row) {
        if (!currentGameState || !currentGameState.units) return null;
        return currentGameState.units.find(u => u.x === col && u.y === row && u.hp > 0);
    }

    function findUnitById(unitId) {
        if (!currentGameState || !currentGameState.units) return null;
        return currentGameState.units.find(u => u.id === unitId);
    }

    function calculatePossibleActions(unit) {
        possibleMoves = [];
        possibleAttacks = [];

        if (!unit || unit.id !== currentActiveUnitIdSketch || !currentGameState || unit.hp <= 0 ) {
            return;
        }
        const activeUnitState = currentGameState.activeUnitActionState || { moved: false, attacked: false };

        if (activeUnitState.attacked) { return; }

        const { x: startX, y: startY, speed, range, type, cannotAttackAdjacent } = unit;

        if (!activeUnitState.moved) {
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const dist = Math.abs(startX - c) + Math.abs(startY - r);
                    if (dist > 0 && dist <= speed && !findUnitAt(c, r)) {
                        possibleMoves.push({ x: c, y: r });
                    }
                }
            }
        }
        currentGameState.units.forEach(targetUnit => {
            if (targetUnit.owner !== localPlayerSide && targetUnit.id !== unit.id && targetUnit.hp > 0) {
                const distToTarget = Math.abs(startX - targetUnit.x) + Math.abs(startY - targetUnit.y);
                if (distToTarget <= range) {
                    if (type === 'Ranger' && cannotAttackAdjacent && distToTarget <= 1) { /* Skip */ }
                    else { possibleAttacks.push({ id: targetUnit.id, x: targetUnit.x, y: targetUnit.y }); }
                }
            }
        });
    }

    p.resetGame = function() {
        currentGameState = null; localPlayerSide = -1; selectedUnitId = null;
        possibleMoves = []; possibleAttacks = [];
        currentActiveUnitIdSketch = null; currentActiveUnitOwnerSketch = -1;
        p.clear();
        if (p.isLooping()) { p.noLoop(); }
        console.log("p5: Game reset and draw loop potentially stopped.");
    };

    // Hàm này có thể được gọi từ client.js nếu cần truy cập gameState
    p.getCurrentGameState = function() {
        return currentGameState;
    }
};