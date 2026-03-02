const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const movesListEl = document.getElementById("movesList");
const newGameBtn = document.getElementById("newGameBtn");
const flipBtn = document.getElementById("flipBtn");

const FILES = "abcdefgh";
const PIECE_UNICODE = {
	w: { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" },
	b: { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" },
};

const WHITE_BACK = ["R", "N", "B", "Q", "K", "B", "N", "R"];

function cloneBoard(board) {
	return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function inBounds(row, col) {
	return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function colorName(color) {
	return color === "w" ? "White" : "Black";
}

function squareName(row, col) {
	return `${FILES[col]}${8 - row}`;
}

function opposite(color) {
	return color === "w" ? "b" : "w";
}

function createInitialBoard() {
	const board = Array.from({ length: 8 }, () => Array(8).fill(null));

	for (let col = 0; col < 8; col++) {
		board[0][col] = { color: "b", type: WHITE_BACK[col] };
		board[1][col] = { color: "b", type: "P" };
		board[6][col] = { color: "w", type: "P" };
		board[7][col] = { color: "w", type: WHITE_BACK[col] };
	}

	return board;
}

let game = null;

function newGame() {
	game = {
		board: createInitialBoard(),
		turn: "w",
		selected: null,
		legalMoves: [],
		moveHistory: [],
		view: "w",
		castling: {
			w: { kingSide: true, queenSide: true },
			b: { kingSide: true, queenSide: true },
		},
		enPassant: null,
		result: null,
	};
	render();
}

function findKing(board, color) {
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const p = board[row][col];
			if (p && p.color === color && p.type === "K") return { row, col };
		}
	}
	return null;
}

function isSquareAttacked(board, targetRow, targetCol, byColor) {
	const pawnDir = byColor === "w" ? -1 : 1;
	const pawnAttackRows = targetRow - pawnDir;
	for (const dc of [-1, 1]) {
		const c = targetCol + dc;
		if (inBounds(pawnAttackRows, c)) {
			const p = board[pawnAttackRows][c];
			if (p && p.color === byColor && p.type === "P") return true;
		}
	}

	const knightSteps = [
		[-2, -1],
		[-2, 1],
		[-1, -2],
		[-1, 2],
		[1, -2],
		[1, 2],
		[2, -1],
		[2, 1],
	];

	for (const [dr, dc] of knightSteps) {
		const r = targetRow + dr;
		const c = targetCol + dc;
		if (!inBounds(r, c)) continue;
		const p = board[r][c];
		if (p && p.color === byColor && p.type === "N") return true;
	}

	const lineChecks = [
		{ dirs: [[1, 0], [-1, 0], [0, 1], [0, -1]], pieces: ["R", "Q"] },
		{ dirs: [[1, 1], [1, -1], [-1, 1], [-1, -1]], pieces: ["B", "Q"] },
	];

	for (const group of lineChecks) {
		for (const [dr, dc] of group.dirs) {
			let r = targetRow + dr;
			let c = targetCol + dc;
			while (inBounds(r, c)) {
				const p = board[r][c];
				if (p) {
					if (p.color === byColor && group.pieces.includes(p.type)) return true;
					break;
				}
				r += dr;
				c += dc;
			}
		}
	}

	for (let dr = -1; dr <= 1; dr++) {
		for (let dc = -1; dc <= 1; dc++) {
			if (dr === 0 && dc === 0) continue;
			const r = targetRow + dr;
			const c = targetCol + dc;
			if (!inBounds(r, c)) continue;
			const p = board[r][c];
			if (p && p.color === byColor && p.type === "K") return true;
		}
	}

	return false;
}

function inCheck(board, color) {
	const king = findKing(board, color);
	if (!king) return false;
	return isSquareAttacked(board, king.row, king.col, opposite(color));
}

function applyMoveToBoard(state, move) {
	const board = cloneBoard(state.board);
	const moving = board[move.from.row][move.from.col];
	board[move.from.row][move.from.col] = null;

	if (move.enPassantCapture) {
		board[move.enPassantCapture.row][move.enPassantCapture.col] = null;
	}

	board[move.to.row][move.to.col] = { ...moving };

	if (move.castleRookFrom && move.castleRookTo) {
		board[move.castleRookTo.row][move.castleRookTo.col] = board[move.castleRookFrom.row][move.castleRookFrom.col];
		board[move.castleRookFrom.row][move.castleRookFrom.col] = null;
	}

	if (move.promotion) {
		board[move.to.row][move.to.col] = { color: moving.color, type: move.promotion };
	}

	return board;
}

function pseudoMovesForPiece(state, row, col, includeCastling = true) {
	const board = state.board;
	const piece = board[row][col];
	if (!piece) return [];
	const moves = [];
	const dir = piece.color === "w" ? -1 : 1;

	function pushMove(toRow, toCol, extra = {}) {
		const target = board[toRow][toCol];
		moves.push({
			from: { row, col },
			to: { row: toRow, col: toCol },
			piece: piece.type,
			color: piece.color,
			capture: !!target || !!extra.enPassantCapture,
			...extra,
		});
	}

	if (piece.type === "P") {
		const one = row + dir;
		if (inBounds(one, col) && !board[one][col]) {
			if (one === 0 || one === 7) {
				pushMove(one, col, { promotion: "Q" });
			} else {
				pushMove(one, col);
			}

			const start = piece.color === "w" ? 6 : 1;
			const two = row + dir * 2;
			if (row === start && !board[two][col]) {
				pushMove(two, col, { doublePawn: true });
			}
		}

		for (const dc of [-1, 1]) {
			const c = col + dc;
			const r = row + dir;
			if (!inBounds(r, c)) continue;
			const target = board[r][c];
			if (target && target.color !== piece.color) {
				if (r === 0 || r === 7) {
					pushMove(r, c, { promotion: "Q" });
				} else {
					pushMove(r, c);
				}
			}

			if (
				state.enPassant &&
				state.enPassant.row === r &&
				state.enPassant.col === c
			) {
				pushMove(r, c, {
					enPassantCapture: { row, col: c },
				});
			}
		}
	}

	if (piece.type === "N") {
		const jumps = [
			[-2, -1],
			[-2, 1],
			[-1, -2],
			[-1, 2],
			[1, -2],
			[1, 2],
			[2, -1],
			[2, 1],
		];
		for (const [dr, dc] of jumps) {
			const r = row + dr;
			const c = col + dc;
			if (!inBounds(r, c)) continue;
			const target = board[r][c];
			if (!target || target.color !== piece.color) pushMove(r, c);
		}
	}

	if (["B", "R", "Q"].includes(piece.type)) {
		const dirs = [];
		if (["B", "Q"].includes(piece.type)) {
			dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
		}
		if (["R", "Q"].includes(piece.type)) {
			dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
		}
		for (const [dr, dc] of dirs) {
			let r = row + dr;
			let c = col + dc;
			while (inBounds(r, c)) {
				const target = board[r][c];
				if (!target) {
					pushMove(r, c);
				} else {
					if (target.color !== piece.color) pushMove(r, c);
					break;
				}
				r += dr;
				c += dc;
			}
		}
	}

	if (piece.type === "K") {
		for (let dr = -1; dr <= 1; dr++) {
			for (let dc = -1; dc <= 1; dc++) {
				if (dr === 0 && dc === 0) continue;
				const r = row + dr;
				const c = col + dc;
				if (!inBounds(r, c)) continue;
				const target = board[r][c];
				if (!target || target.color !== piece.color) pushMove(r, c);
			}
		}

		if (includeCastling) {
			const rights = state.castling[piece.color];
			const homeRow = piece.color === "w" ? 7 : 0;
			if (row === homeRow && col === 4 && !inCheck(board, piece.color)) {
				if (
					rights.kingSide &&
					!board[homeRow][5] &&
					!board[homeRow][6] &&
					board[homeRow][7] &&
					board[homeRow][7].type === "R" &&
					board[homeRow][7].color === piece.color &&
					!isSquareAttacked(board, homeRow, 5, opposite(piece.color)) &&
					!isSquareAttacked(board, homeRow, 6, opposite(piece.color))
				) {
					pushMove(homeRow, 6, {
						castleRookFrom: { row: homeRow, col: 7 },
						castleRookTo: { row: homeRow, col: 5 },
					});
				}

				if (
					rights.queenSide &&
					!board[homeRow][1] &&
					!board[homeRow][2] &&
					!board[homeRow][3] &&
					board[homeRow][0] &&
					board[homeRow][0].type === "R" &&
					board[homeRow][0].color === piece.color &&
					!isSquareAttacked(board, homeRow, 3, opposite(piece.color)) &&
					!isSquareAttacked(board, homeRow, 2, opposite(piece.color))
				) {
					pushMove(homeRow, 2, {
						castleRookFrom: { row: homeRow, col: 0 },
						castleRookTo: { row: homeRow, col: 3 },
					});
				}
			}
		}
	}

	return moves;
}

function legalMovesForPiece(state, row, col) {
	const piece = state.board[row][col];
	if (!piece || piece.color !== state.turn) return [];
	const pseudo = pseudoMovesForPiece(state, row, col, true);
	return pseudo.filter((move) => {
		const nextBoard = applyMoveToBoard(state, move);
		return !inCheck(nextBoard, piece.color);
	});
}

function allLegalMoves(state, color) {
	const result = [];
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const p = state.board[row][col];
			if (!p || p.color !== color) continue;
			const pseudo = pseudoMovesForPiece(state, row, col, true);
			for (const move of pseudo) {
				const nextBoard = applyMoveToBoard(state, move);
				if (!inCheck(nextBoard, color)) result.push(move);
			}
		}
	}
	return result;
}

function algebraic(move, stateBefore, stateAfter) {
	if (move.castleRookFrom) {
		return move.to.col === 6 ? "O-O" : "O-O-O";
	}

	const moving = stateBefore.board[move.from.row][move.from.col];
	const dest = squareName(move.to.row, move.to.col);
	const captureMark = move.capture ? "x" : "";

	let text = "";
	if (moving.type === "P") {
		text = move.capture ? `${FILES[move.from.col]}${captureMark}${dest}` : dest;
	} else {
		text = `${moving.type}${captureMark}${dest}`;
	}

	if (move.promotion) text += `=${move.promotion}`;

	const enemy = opposite(moving.color);
	const enemyMoves = allLegalMoves(stateAfter, enemy);
	if (inCheck(stateAfter.board, enemy)) {
		text += enemyMoves.length ? "+" : "#";
	}

	return text;
}

function finalizeStatus() {
	if (game.result) return;
	const side = game.turn;
	const legal = allLegalMoves(game, side);
	const check = inCheck(game.board, side);

	if (legal.length === 0) {
		if (check) {
			game.result = `${colorName(opposite(side))} wins by checkmate.`;
		} else {
			game.result = "Draw by stalemate.";
		}
	}
}

function updateCastlingRights(move, movingPiece, capturedPiece) {
	const color = movingPiece.color;
	const enemy = opposite(color);

	if (movingPiece.type === "K") {
		game.castling[color].kingSide = false;
		game.castling[color].queenSide = false;
	}

	if (movingPiece.type === "R") {
		if (move.from.row === (color === "w" ? 7 : 0) && move.from.col === 0) {
			game.castling[color].queenSide = false;
		}
		if (move.from.row === (color === "w" ? 7 : 0) && move.from.col === 7) {
			game.castling[color].kingSide = false;
		}
	}

	if (capturedPiece && capturedPiece.type === "R") {
		if (move.to.row === (enemy === "w" ? 7 : 0) && move.to.col === 0) {
			game.castling[enemy].queenSide = false;
		}
		if (move.to.row === (enemy === "w" ? 7 : 0) && move.to.col === 7) {
			game.castling[enemy].kingSide = false;
		}
	}
}

function makeMove(move) {
	if (game.result) return;

	const stateBefore = {
		board: cloneBoard(game.board),
		turn: game.turn,
		castling: JSON.parse(JSON.stringify(game.castling)),
		enPassant: game.enPassant ? { ...game.enPassant } : null,
	};

	const movingPiece = game.board[move.from.row][move.from.col];
	const capturedPiece = move.enPassantCapture
		? game.board[move.enPassantCapture.row][move.enPassantCapture.col]
		: game.board[move.to.row][move.to.col];

	game.board = applyMoveToBoard(game, move);

	updateCastlingRights(move, movingPiece, capturedPiece);

	game.enPassant = null;
	if (movingPiece.type === "P" && move.doublePawn) {
		game.enPassant = {
			row: (move.from.row + move.to.row) / 2,
			col: move.from.col,
		};
	}

	game.turn = opposite(game.turn);

	const stateAfter = {
		board: cloneBoard(game.board),
		turn: game.turn,
		castling: JSON.parse(JSON.stringify(game.castling)),
		enPassant: game.enPassant ? { ...game.enPassant } : null,
	};

	const note = algebraic(move, stateBefore, stateAfter);
	game.moveHistory.push(note);

	game.selected = null;
	game.legalMoves = [];

	finalizeStatus();
	render();
}

function handleSquareClick(row, col) {
	if (game.result) return;

	const piece = game.board[row][col];
	const selected = game.selected;

	if (selected) {
		const chosen = game.legalMoves.find((m) => m.to.row === row && m.to.col === col);
		if (chosen) {
			makeMove(chosen);
			return;
		}
	}

	if (piece && piece.color === game.turn) {
		game.selected = { row, col };
		game.legalMoves = legalMovesForPiece(game, row, col);
	} else {
		game.selected = null;
		game.legalMoves = [];
	}

	render();
}

function boardCoords(displayRow, displayCol) {
	if (game.view === "w") {
		return { row: displayRow, col: displayCol };
	}
	return { row: 7 - displayRow, col: 7 - displayCol };
}

function renderBoard() {
	boardEl.innerHTML = "";

	const checkedKing = inCheck(game.board, game.turn)
		? findKing(game.board, game.turn)
		: null;

	for (let dr = 0; dr < 8; dr++) {
		for (let dc = 0; dc < 8; dc++) {
			const { row, col } = boardCoords(dr, dc);
			const square = document.createElement("button");
			square.type = "button";
			square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
			square.setAttribute("aria-label", squareName(row, col));

			const piece = game.board[row][col];
			if (piece) square.textContent = PIECE_UNICODE[piece.color][piece.type];

			if (game.selected && game.selected.row === row && game.selected.col === col) {
				square.classList.add("selected");
			}

			const targetMove = game.legalMoves.find((m) => m.to.row === row && m.to.col === col);
			if (targetMove) square.classList.add(targetMove.capture ? "capture" : "legal");

			if (checkedKing && checkedKing.row === row && checkedKing.col === col) {
				square.classList.add("check");
			}

			square.addEventListener("click", () => handleSquareClick(row, col));
			boardEl.appendChild(square);
		}
	}
}

function renderMoves() {
	movesListEl.innerHTML = "";
	game.moveHistory.forEach((moveText, i) => {
		const item = document.createElement("li");
		const fullMove = Math.floor(i / 2) + 1;
		const prefix = i % 2 === 0 ? `${fullMove}. ` : "";
		item.textContent = `${prefix}${moveText}`;
		movesListEl.appendChild(item);
	});
	movesListEl.scrollTop = movesListEl.scrollHeight;
}

function renderStatus() {
	if (game.result) {
		statusEl.innerHTML = `<strong>${game.result}</strong>`;
		return;
	}

	const check = inCheck(game.board, game.turn);
	statusEl.innerHTML = `Turn: <strong>${colorName(game.turn)}</strong><br>${check ? "<span style='color:#fca5a5'>Check!</span>" : "No check."}`;
}

function render() {
	renderBoard();
	renderMoves();
	renderStatus();
}

newGameBtn.addEventListener("click", newGame);
flipBtn.addEventListener("click", () => {
	game.view = game.view === "w" ? "b" : "w";
	render();
});

newGame();
