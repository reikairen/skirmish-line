// Matches COMBINATION_TYPES: CR(5) > 3oaK(4) > Color(3) > Run(2) > Sum(1)
const FORMATION_NAMES = {
  0: '',
  1: 'Sum',
  2: 'Sequence',
  3: 'Category',
  4: 'Triplet',
  5: 'Cat. Seq.',
};

// Must match server COMBINATION_TYPES: CR(5) > 3oaK(4) > Color(3) > Run(2) > Sum(1)
function getFormationType(tiles) {
  if (tiles.length < 3) return 0;

  const isCat = tiles.every(c => c.color === tiles[0].color);
  const sorted = [...tiles].sort((a, b) => a.value - b.value);
  const isSeq = sorted.every((c, i) => i === 0 || c.value === sorted[i - 1].value + 1);
  const isTrip = tiles.every(c => c.value === tiles[0].value);

  if (isCat && isSeq) return 5;
  if (isTrip) return 4;
  if (isCat) return 3;
  if (isSeq) return 2;
  return 1;
}

function createTileElement(tile, options = {}) {
  const div = document.createElement('div');
  const classes = ['tile', `tile-${tile.color}`];
  if (options.small) classes.push('tile-sm');
  if (options.clickable) classes.push('clickable');
  if (options.selected) classes.push('selected');
  div.className = classes.join(' ');
  div.textContent = tile.value;
  if (options.onClick) div.addEventListener('click', options.onClick);
  return div;
}

function createHiddenTile() {
  const div = document.createElement('div');
  div.className = 'tile tile-hidden';
  return div;
}

const Renderer = {
  renderPeerTray(count) {
    const container = document.getElementById('peer-tray');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      container.appendChild(createHiddenTile());
    }
  },

  renderYourTray(tiles, selectedIndex, onSelect, dimmed) {
    const container = document.getElementById('your-tray');
    container.innerHTML = '';
    container.classList.toggle('dimmed', !!dimmed);
    tiles.forEach((tile, i) => {
      const el = createTileElement(tile, {
        clickable: !dimmed,
        selected: i === selectedIndex,
        onClick: dimmed ? null : () => onSelect(i),
      });
      container.appendChild(el);
    });
  },

  renderWorkspace(nodes, userId, onNodeClick, clickableNodes) {
    const container = document.getElementById('workspace');
    container.innerHTML = '';

    nodes.forEach((node, i) => {
      const col = document.createElement('div');
      col.className = 'node-column';

      // Peer tiles (top — grow toward marker)
      const peerTiles = document.createElement('div');
      peerTiles.className = 'node-tiles';
      const peerList = userId === 1 ? node.player2Cards : node.player1Cards;
      const peerLabel = document.createElement('div');
      peerLabel.className = 'combo-label';
      peerLabel.textContent = FORMATION_NAMES[getFormationType(peerList)];
      peerTiles.appendChild(peerLabel);
      peerList.forEach(tile => {
        peerTiles.appendChild(createTileElement(tile, { small: true }));
      });
      col.appendChild(peerTiles);

      // Marker + ownership label
      const markerWrap = document.createElement('div');
      markerWrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:2px;';

      const marker = document.createElement('div');
      marker.className = 'marker';

      const ownerLabel = document.createElement('div');
      ownerLabel.className = 'owner-label';

      if (node.claimed) {
        const securedByYou = node.winner === userId;
        marker.classList.add(securedByYou ? 'secured-1' : 'secured-2');
        marker.textContent = securedByYou ? '\u2713' : '\u2717';
        ownerLabel.textContent = securedByYou ? 'YOU' : 'THEM';
        ownerLabel.classList.add(securedByYou ? 'owner-you' : 'owner-peer');
      } else {
        marker.textContent = i + 1;
        ownerLabel.textContent = '\u00A0';
        if (clickableNodes && clickableNodes.includes(i)) {
          marker.classList.add('clickable');
          marker.addEventListener('click', () => onNodeClick(i));
        }
      }
      markerWrap.appendChild(marker);
      markerWrap.appendChild(ownerLabel);
      col.appendChild(markerWrap);

      // Your tiles (bottom — grow away from marker)
      const yourTiles = document.createElement('div');
      yourTiles.className = 'node-tiles bottom';
      const yourList = userId === 1 ? node.player1Cards : node.player2Cards;
      yourList.forEach(tile => {
        yourTiles.appendChild(createTileElement(tile, { small: true }));
      });
      const yourLabel = document.createElement('div');
      yourLabel.className = 'combo-label';
      yourLabel.textContent = FORMATION_NAMES[getFormationType(yourList)];
      yourTiles.appendChild(yourLabel);
      col.appendChild(yourTiles);

      container.appendChild(col);
    });
  },

  renderHeader(state, userNames) {
    const peerId = state.playerId === 1 ? 2 : 1;

    document.getElementById('peer-name').textContent = userNames[peerId] || 'Opponent';
    document.getElementById('your-name').textContent = userNames[state.playerId] || 'You';

    document.getElementById('peer-points').textContent = state.scores[peerId];
    document.getElementById('your-points').textContent = state.scores[state.playerId];

    const isYourTurn = state.currentPlayer === state.playerId;
    const indicator = document.getElementById('cycle-indicator');
    if (state.gameOver) {
      indicator.textContent = 'Complete';
    } else if (isYourTurn) {
      indicator.textContent = 'Your Turn';
      indicator.style.color = '#43a047';
    } else {
      indicator.textContent = 'Waiting...';
      indicator.style.color = '#e94560';
    }

    document.getElementById('pool-count').textContent =
      state.deckRemaining > 0 ? `${state.deckRemaining} tiles left` : 'Pool empty';
  },

  updateInstruction(state, selectedTileIndex) {
    const bar = document.getElementById('instruction-bar');
    const isMyTurn = state.currentPlayer === state.playerId;

    if (state.gameOver) {
      bar.textContent = '';
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';

    if (!isMyTurn) {
      bar.textContent = 'Waiting for your opponent to make a move...';
      bar.className = 'instruction-bar waiting';
      return;
    }

    bar.className = 'instruction-bar';

    if (state.turnPhase === 'play') {
      if (selectedTileIndex === null) {
        bar.textContent = 'Select a tile from your hand below';
      } else {
        bar.textContent = 'Now tap a glowing node to place your tile';
      }
    } else if (state.turnPhase === 'claim') {
      bar.textContent = 'Press "Done — End Turn" to finish your turn';
    }
  },

  showEndTurnButton(show, onClick) {
    const btn = document.getElementById('btn-end-cycle');
    btn.style.display = show ? 'inline-block' : 'none';
    btn.onclick = onClick || null;
  },

  showForfeitButton(show) {
    document.getElementById('btn-forfeit').style.display = show ? 'inline-block' : 'none';
  },

  showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  },
};
