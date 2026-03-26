const socket = io();

let sessionState = null;
let selectedTileIndex = null;
let myUserId = null;
let userNames = {};

// --- Screen management ---
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  if (id === 'menu-screen') {
    startPolling();
  } else {
    stopPolling();
  }
}

function showOverlay(id) {
  document.getElementById(id).classList.add('active');
}

function hideOverlay(id) {
  document.getElementById(id).classList.remove('active');
}

// Random display name generator
const ADJECTIVES = [
  'Swift', 'Bold', 'Sly', 'Keen', 'Brave', 'Calm', 'Deft', 'Grim',
  'Hale', 'Iron', 'Jade', 'Lone', 'Nova', 'Pale', 'Sage', 'Thorn',
  'Vast', 'Wild', 'Zen', 'Ash', 'Dusk', 'Flux', 'Gilt', 'Hex',
];
const NOUNS = [
  'Fox', 'Hawk', 'Wolf', 'Bear', 'Lynx', 'Crow', 'Orca', 'Pike',
  'Wren', 'Moth', 'Hare', 'Elk', 'Rook', 'Viper', 'Finch', 'Owl',
  'Stag', 'Crane', 'Drake', 'Puma', 'Seal', 'Ram', 'Newt', 'Jay',
];

function randomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}

// Set random default name on load
document.getElementById('user-name').value = randomName();

function getUserName() {
  return document.getElementById('user-name').value.trim() || randomName();
}

// --- Menu handlers ---

document.getElementById('btn-solo').addEventListener('click', () => {
  const difficulty = document.getElementById('difficulty-level').value;
  socket.emit('create-room', { playerName: getUserName(), mode: 'ai', aiDifficulty: difficulty });
});

document.getElementById('btn-create-public').addEventListener('click', () => {
  socket.emit('create-room', { playerName: getUserName(), mode: 'public' });
});

document.getElementById('btn-create-private').addEventListener('click', () => {
  socket.emit('create-room', { playerName: getUserName(), mode: 'private' });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const code = document.getElementById('session-code-input').value.trim().toUpperCase();
  if (!code || code.length !== 4) {
    Renderer.showToast('Enter a 4-character session code');
    return;
  }
  socket.emit('join-room', { roomId: code, playerName: getUserName() });
});

document.getElementById('btn-back-menu').addEventListener('click', () => {
  socket.emit('leave-room');
  showScreen('menu-screen');
});

document.getElementById('btn-new-session').addEventListener('click', () => {
  hideOverlay('result-overlay');
  showScreen('menu-screen');
  sessionState = null;
  selectedTileIndex = null;
});

document.getElementById('btn-disconnect-menu').addEventListener('click', () => {
  hideOverlay('disconnect-overlay');
  showScreen('menu-screen');
  sessionState = null;
  selectedTileIndex = null;
});

document.getElementById('session-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// Guide
document.getElementById('btn-open-guide').addEventListener('click', () => {
  showOverlay('guide-overlay');
});
document.getElementById('btn-close-guide').addEventListener('click', () => {
  hideOverlay('guide-overlay');
});

// Forfeit
document.getElementById('btn-forfeit').addEventListener('click', () => {
  showOverlay('forfeit-overlay');
});
document.getElementById('btn-forfeit-cancel').addEventListener('click', () => {
  hideOverlay('forfeit-overlay');
});
document.getElementById('btn-forfeit-confirm').addEventListener('click', () => {
  hideOverlay('forfeit-overlay');
  socket.emit('leave-room');
  showScreen('menu-screen');
  sessionState = null;
  selectedTileIndex = null;
});

// --- Socket events ---
socket.on('room-created', ({ roomId, mode }) => {
  if (mode === 'private') {
    document.getElementById('lobby-session-code').textContent = roomId;
    document.getElementById('lobby-private-info').style.display = '';
    document.getElementById('lobby-public-info').style.display = 'none';
  } else {
    document.getElementById('lobby-private-info').style.display = 'none';
    document.getElementById('lobby-public-info').style.display = '';
  }
  showScreen('lobby-screen');
});

socket.on('game-start', ({ playerNames: names, playerId }) => {
  myUserId = playerId;
  const peerId = playerId === 1 ? 2 : 1;
  userNames = {
    [playerId]: names[playerId - 1] || 'You',
    [peerId]: names[peerId - 1] || 'Opponent',
  };
  selectedTileIndex = null;
  showScreen('session-screen');
});

socket.on('game-state', (state) => {
  sessionState = state;
  renderSession();
});

socket.on('game-over', ({ winner, winnerName, summary }) => {
  const isVictory = winner === myUserId;

  const title = document.getElementById('result-title');
  title.textContent = isVictory ? 'Victory' : 'Defeat';
  title.className = isVictory ? 'victory-title' : 'defeat-title';

  document.getElementById('result-message').textContent =
    isVictory ? 'You secured the required nodes.' : `${winnerName} secured the required nodes.`;

  if (summary) {
    const pid = myUserId;
    const peerId = pid === 1 ? 2 : 1;
    const youName = userNames[pid] || 'You';
    const peerName = userNames[peerId] || 'Opponent';

    document.getElementById('result-reason').textContent = summary.winReason;

    let html = '';

    html += '<div class="summary-scores">';
    html += `<div class="summary-score-box"><div class="score-num score-you">${summary.scores[pid]}</div><div class="score-label">${escapeHtml(youName)}</div></div>`;
    html += `<div class="summary-score-box"><div class="score-num" style="color:#555;">&ndash;</div><div class="score-label">&nbsp;</div></div>`;
    html += `<div class="summary-score-box"><div class="score-num score-peer">${summary.scores[peerId]}</div><div class="score-label">${escapeHtml(peerName)}</div></div>`;
    html += '</div>';

    html += '<table class="summary-table">';
    html += `<tr><th>Node</th><th>${escapeHtml(youName)}</th><th>${escapeHtml(peerName)}</th><th>Won By</th></tr>`;

    for (const node of summary.nodes) {
      const youType = pid === 1 ? node.p1Type : node.p2Type;
      const youSum = pid === 1 ? node.p1Sum : node.p2Sum;
      const peerType = pid === 1 ? node.p2Type : node.p1Type;
      const peerSum = pid === 1 ? node.p2Sum : node.p1Sum;

      let resultText, resultClass;
      if (node.outcome === pid) {
        resultText = 'You';
        resultClass = 'node-you';
      } else if (node.outcome === peerId) {
        resultText = escapeHtml(peerName);
        resultClass = 'node-peer';
      } else if (node.outcome === 'tie') {
        resultText = 'Tie';
        resultClass = 'node-tie';
      } else {
        resultText = 'Unresolved';
        resultClass = 'node-open';
      }

      const youCell = youType ? `${youType} (${youSum})` : '&mdash;';
      const peerCell = peerType ? `${peerType} (${peerSum})` : '&mdash;';

      html += `<tr>`;
      html += `<td>${node.id + 1}</td>`;
      html += `<td class="${node.outcome === pid ? 'node-you' : ''}">${youCell}</td>`;
      html += `<td class="${node.outcome === peerId ? 'node-peer' : ''}">${peerCell}</td>`;
      html += `<td class="node-winner-cell ${resultClass}">${resultText}</td>`;
      html += `</tr>`;
    }
    html += '</table>';

    document.getElementById('result-breakdown').innerHTML = html;
  }

  showOverlay('result-overlay');
});

socket.on('opponent-disconnected', () => {
  showOverlay('disconnect-overlay');
});

socket.on('action-error', ({ message }) => {
  Renderer.showToast(message);
});

// Open sessions list
socket.on('public-games', (sessions) => {
  const container = document.getElementById('open-sessions-list');
  container.innerHTML = '';

  if (sessions.length === 0) {
    container.innerHTML = '<div class="no-sessions">No open sessions right now</div>';
    return;
  }

  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'open-session-item';
    item.innerHTML = `<span class="host-name">${escapeHtml(session.hostName)} is waiting</span>`;
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn btn-primary';
    joinBtn.textContent = 'Join';
    joinBtn.addEventListener('click', () => {
      socket.emit('join-room', { roomId: session.roomId, playerName: getUserName() });
    });
    item.appendChild(joinBtn);
    container.appendChild(item);
  });
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Poll open sessions only while on menu screen
let pollInterval = null;

function startPolling() {
  if (pollInterval) return;
  socket.emit('get-public-games');
  pollInterval = setInterval(() => {
    socket.emit('get-public-games');
  }, 3000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

startPolling();

// --- Session rendering ---
function renderSession() {
  if (!sessionState) return;

  const state = sessionState;
  const isMyTurn = state.currentPlayer === state.playerId;
  const inAssignPhase = state.turnPhase === 'play';
  const inEndPhase = state.turnPhase === 'claim';

  Renderer.renderHeader(state, userNames);
  Renderer.updateInstruction(state, selectedTileIndex);
  Renderer.renderPeerTray(state.opponentCardCount);

  // Determine clickable nodes
  let clickableNodes = [];
  if (isMyTurn && inAssignPhase && selectedTileIndex !== null) {
    clickableNodes = state.borders
      .filter(b => {
        if (b.claimed) return false;
        const myTiles = state.playerId === 1 ? b.player1Cards : b.player2Cards;
        return myTiles.length < 3;
      })
      .map(b => b.id);
  }

  Renderer.renderWorkspace(state.borders, state.playerId, onNodeClick, clickableNodes);

  // Render hand (dimmed when not your turn)
  const dimmed = !isMyTurn || !inAssignPhase;
  Renderer.renderYourTray(
    state.hand,
    dimmed ? null : selectedTileIndex,
    dimmed ? () => {} : onTileSelect,
    dimmed
  );

  // Show end turn button during claim phase
  Renderer.showEndTurnButton(
    isMyTurn && inEndPhase && !state.gameOver,
    () => socket.emit('end-turn')
  );

  // Show forfeit button during active session
  Renderer.showForfeitButton(!state.gameOver);
}

function onTileSelect(index) {
  if (!sessionState) return;
  if (sessionState.currentPlayer !== sessionState.playerId) return;
  if (sessionState.turnPhase !== 'play') return;

  selectedTileIndex = selectedTileIndex === index ? null : index;
  renderSession();
}

function onNodeClick(nodeIndex) {
  if (!sessionState) return;
  if (sessionState.currentPlayer !== sessionState.playerId) return;

  if (sessionState.turnPhase === 'play' && selectedTileIndex !== null) {
    socket.emit('play-card', { cardIndex: selectedTileIndex, borderIndex: nodeIndex });
    selectedTileIndex = null;
  }
}
