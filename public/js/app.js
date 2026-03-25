const socket = io();

let sessionState = null;
let selectedTileIndex = null;
let myUserId = null;
let userNames = {};

// --- Screen management ---
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showOverlay(id) {
  document.getElementById(id).classList.add('active');
}

function hideOverlay(id) {
  document.getElementById(id).classList.remove('active');
}

function getUserName() {
  return document.getElementById('user-name').value.trim() || 'Analyst';
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
  socket.emit('get-public-games');
});

document.getElementById('btn-new-session').addEventListener('click', () => {
  hideOverlay('result-overlay');
  showScreen('menu-screen');
  sessionState = null;
  selectedTileIndex = null;
  socket.emit('get-public-games');
});

document.getElementById('btn-disconnect-menu').addEventListener('click', () => {
  hideOverlay('disconnect-overlay');
  showScreen('menu-screen');
  sessionState = null;
  selectedTileIndex = null;
  socket.emit('get-public-games');
});

document.getElementById('session-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// Guide overlay
document.getElementById('btn-open-guide').addEventListener('click', () => {
  showOverlay('guide-overlay');
});
document.getElementById('btn-close-guide').addEventListener('click', () => {
  hideOverlay('guide-overlay');
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
    [peerId]: names[peerId - 1] || 'Peer',
  };
  selectedTileIndex = null;
  showScreen('session-screen');
});

socket.on('game-state', (state) => {
  sessionState = state;
  renderSession();
});

socket.on('game-over', ({ winner, winnerName, summary, playerId }) => {
  const successful = winner === myUserId;
  document.getElementById('result-title').textContent = successful ? 'Successful' : 'Unsuccessful';
  document.getElementById('result-message').textContent =
    successful ? 'You have secured the required nodes.' : `${winnerName} secured the required nodes.`;

  // Render summary
  if (summary) {
    const pid = myUserId;
    const peerId = pid === 1 ? 2 : 1;
    const youName = userNames[pid] || 'You';
    const peerName = userNames[peerId] || 'Peer';

    document.getElementById('result-reason').textContent = summary.winReason;

    let html = '';

    // Score boxes
    html += '<div class="summary-scores">';
    html += `<div class="summary-score-box"><div class="score-num score-you">${summary.scores[pid]}</div><div class="score-label">${escapeHtml(youName)}</div></div>`;
    html += `<div class="summary-score-box"><div class="score-num" style="color:#888;">vs</div><div class="score-label">&nbsp;</div></div>`;
    html += `<div class="summary-score-box"><div class="score-num score-peer">${summary.scores[peerId]}</div><div class="score-label">${escapeHtml(peerName)}</div></div>`;
    html += '</div>';

    // Node-by-node table
    html += '<table class="summary-table">';
    html += `<tr><th>Node</th><th>${escapeHtml(youName)}</th><th>${escapeHtml(peerName)}</th><th>Result</th></tr>`;

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
        resultText = 'Open';
        resultClass = 'node-open';
      }

      const youCell = youType ? `${youType} (${youSum})` : '---';
      const peerCell = peerType ? `${peerType} (${peerSum})` : '---';

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

socket.on('error', ({ message }) => {
  Renderer.showToast(message);
});

// Open sessions list
socket.on('public-games', (sessions) => {
  const container = document.getElementById('open-sessions-list');
  container.innerHTML = '';

  if (sessions.length === 0) {
    container.innerHTML = '<div class="no-sessions">No open sessions available</div>';
    return;
  }

  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'open-session-item';
    item.innerHTML = `<span class="host-name">${escapeHtml(session.hostName)} is waiting...</span>`;
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn btn-primary';
    joinBtn.textContent = 'Connect';
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

// Request open sessions on load and poll while on menu
socket.emit('get-public-games');
setInterval(() => {
  if (document.getElementById('menu-screen').classList.contains('active')) {
    socket.emit('get-public-games');
  }
}, 3000);

// --- Session rendering ---
function renderSession() {
  if (!sessionState) return;

  const state = sessionState;
  const isMyCycle = state.currentPlayer === state.playerId;
  const inAssignPhase = state.turnPhase === 'play';
  const inSecurePhase = state.turnPhase === 'claim';

  Renderer.renderHeader(state, userNames);
  Renderer.renderPeerTray(state.opponentCardCount);

  let clickableNodes = [];
  if (isMyCycle && inAssignPhase && selectedTileIndex !== null) {
    clickableNodes = state.borders
      .filter(b => {
        if (b.claimed) return false;
        const myTiles = state.playerId === 1 ? b.player1Cards : b.player2Cards;
        return myTiles.length < 3;
      })
      .map(b => b.id);
  }

  Renderer.renderWorkspace(state.borders, state.playerId, onNodeClick, clickableNodes);

  if (isMyCycle && inAssignPhase) {
    Renderer.renderYourTray(state.hand, selectedTileIndex, onTileSelect);
  } else {
    Renderer.renderYourTray(state.hand, null, () => {});
  }

  Renderer.showEndCycleButton(
    isMyCycle && inSecurePhase && !state.gameOver,
    () => socket.emit('end-turn')
  );
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
