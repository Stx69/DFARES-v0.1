function zeroFill(i) {
  if (i >= 0 && i <= 9) return '0' + i;
  else return i;
}

function getCurrentTime() {
  var date = new Date();
  var month = zeroFill(date.getMonth() + 1);
  var day = zeroFill(date.getDate());
  var hour = zeroFill(date.getHours());
  var minute = zeroFill(date.getMinutes());
  var second = zeroFill(date.getSeconds());

  var curTime =
    date.getFullYear() + '-' + month + '-' + day + '_' + hour + '-' + minute + '-' + second;

  return curTime;
}

class Plugin {
  constructor() {
    this.playerData = [];
    this.lotteryWinners = [];
    this.status = document.createElement('div');
    this.status.style.marginTop = '10px';
    this.status.style.textAlign = 'center';
    this.possibleWinners = 1;
    this.minPlayers = this.possibleWinners + 1;
  }

  async fetchPlayerData() {
    try {
      // player.buyedLotteryTicket = true !!!
      // const playerData = await df.getAllPlayers();
      // this.playerData = playerData.filter((pl) => pl.buyLotteryTicket === true);
      this.playerData = await df.getAllPlayers();
    } catch (error) {
      console.error('Error fetching player data:', error);
      this.status.innerText = 'Failed to fetch player data.';
      this.status.style.color = 'red';
    }
  }

  async exportMap(player) {
    try {
      const mapRaw = await this.generateMap(player);

      const map = JSON.stringify(mapRaw);

      const blob = new Blob([map], { type: 'application/json' });
      const anchor = document.createElement('a');
      const currentTime = getCurrentTime();
      anchor.download = df.getContractAddress().substring(0, 6) + '_' + currentTime + '_map.json';
      anchor.href = (window.webkitURL || window.URL).createObjectURL(blob);
      anchor.dataset.downloadurl = ['application/json', anchor.download, anchor.href].join(':');
      anchor.click();

      this.status.innerText = 'Map data exported successfully.';
      this.status.style.color = 'green';
    } catch (error) {
      console.error('Error exporting map:', error);
      this.status.innerText = 'Failed to export map data.';
      this.status.style.color = 'red';
    }
  }

  intersectsXY(chunk, begin, end) {
    const chunkLeft = chunk.chunkFootprint.bottomLeft.x;
    const chunkRight = chunkLeft + chunk.chunkFootprint.sideLength;
    const chunkBottom = chunk.chunkFootprint.bottomLeft.y;
    const chunkTop = chunkBottom + chunk.chunkFootprint.sideLength;

    return (
      chunkLeft >= begin.x && chunkRight <= end.x && chunkTop <= begin.y && chunkBottom >= end.y
    );
  }

  getPlayerHomeCoords(player) {
    const planet = df.getLocationOfPlanet(player.homePlanetId);

    return planet.coords ? planet.coords : { x: 0, y: 0 };
  }

  generateMap(player) {
    try {
      const { x: homeX, y: homeY } = this.getPlayerHomeCoords(player);
      const CHUNK_SIZE = 65536;

      const chunks = ui.getExploredChunks();

      const chunksAsArray = Array.from(chunks);

      const begin = {
        x: homeX - CHUNK_SIZE / 2,
        y: homeY + CHUNK_SIZE / 2,
      };
      const end = {
        x: homeX + CHUNK_SIZE / 2,
        y: homeY - CHUNK_SIZE / 2,
      };

      const chunksAsArray1 = chunksAsArray.filter((chunk) => {
        return this.intersectsXY(chunk, begin, end);
      });
      debugger;
      return chunksAsArray1;
    } catch (error) {
      console.error('Error generating map:', error);
      throw error;
    }
  }

  async pickLotteryWinners() {
    try {
      this.playerData.forEach((player) => {
        player.buyLotteryTicket = true;
      });

      const lotteryPlayers = this.playerData.filter((player) => player.buyLotteryTicket);

      if (lotteryPlayers.length < this.minPlayers) {
        this.status.innerText = 'Not enough lottery participants.';
        this.status.style.color = 'red';
        return;
      }
      this.lotteryWinners = [];
      for (let i = 0; i < this.possibleWinners; i++) {
        const randomIndex = Math.floor(Math.random() * lotteryPlayers.length);

        this.lotteryWinners.push(lotteryPlayers[randomIndex]);
        lotteryPlayers.splice(randomIndex, 1);
      }

      this.status.innerText = 'Lottery winners picked.';
      this.status.style.color = 'green';
      this.renderPlayerData(document.getElementById('dataContainer'));
    } catch (error) {
      console.error('Error picking lottery winners:', error);
      this.status.innerText = 'Failed to pick lottery winners.';
      this.status.style.color = 'red';
    }
  }

  renderPlayerData(container) {
    container.innerHTML = ''; // Clear previous content

    if (this.playerData.length === 0) {
      this.status.innerText = 'No player data available.';
      return;
    }

    let playerTable = document.createElement('table');
    playerTable.style.width = '100%';

    // Create header row
    let headerRow = playerTable.insertRow();
    let addressHeader = headerRow.insertCell();
    addressHeader.innerText = 'Address';
    let planetIdHeader = headerRow.insertCell();
    planetIdHeader.innerText = 'Home Planet ID';
    let exportHeader = headerRow.insertCell();
    exportHeader.innerText = 'Export Map';

    // Create rows for player data
    this.playerData.forEach((player) => {
      let playerRow = playerTable.insertRow();
      let addressCell = playerRow.insertCell();
      addressCell.innerText = player.address.slice(0, 10);
      addressCell.addEventListener('click', () => {
        navigator.clipboard
          .writeText(player.address)
          .then(() => {
            this.status.innerText = 'Copied to clipboard: ' + player.address;
            this.status.style.color = 'green';
          })
          .catch((error) => {
            console.error('Error copying to clipboard:', error);
            this.status.innerText = 'Failed to copy to clipboard.';
            this.status.style.color = 'red';
          });
      });
      let planetIdCell = playerRow.insertCell();
      planetIdCell.innerText = player.homePlanetId.slice(0, 10);
      planetIdCell.addEventListener('click', () => {
        navigator.clipboard
          .writeText(player.homePlanetId)
          .then(() => {
            ui.centerCoords(this.getPlayerHomeCoords(player));
            this.status.innerText = 'Copied to clipboard: ' + player.homePlanetId;
            this.status.style.color = 'green';
          })
          .catch((error) => {
            console.error('Error copying to clipboard:', error);

            this.status.innerText = 'Failed to copy to clipboard.';
            this.status.style.color = 'red';
          });
      });
      let exportCell = playerRow.insertCell();
      if (this.lotteryWinners.includes(player)) {
        let exportButton = document.createElement('button');
        exportButton.innerText = 'Export Map';
        exportButton.onclick = async () => {
          await this.exportMap(player);
        };
        exportCell.appendChild(exportButton);
      } else if (player.buyLotteryTicket) {
        exportCell.innerText = '-';
      }
    });

    container.appendChild(playerTable);
  }

  render(container) {
    container.style.width = '400px';

    let statusContainer = document.createElement('div');
    statusContainer.appendChild(this.status);

    let dataContainer = document.createElement('div');
    dataContainer.id = 'dataContainer';

    let lotteryButton = document.createElement('button');
    lotteryButton.innerText = 'Lottery';
    lotteryButton.onclick = async () => {
      await this.pickLotteryWinners();
    };

    // Input field for possible winners
    let possibleWinnersInput = document.createElement('input');
    possibleWinnersInput.type = 'number';
    possibleWinnersInput.min = 1;
    possibleWinnersInput.max = 9999;
    possibleWinnersInput.title = 'Winner to pick';
    possibleWinnersInput.value = this.possibleWinners;
    possibleWinnersInput.addEventListener('input', () => {
      this.possibleWinners = parseInt(possibleWinnersInput.value);
    });

    // Input field for minimum players
    let minPlayersInput = document.createElement('input');
    minPlayersInput.type = 'number';
    minPlayersInput.min = 1;
    minPlayersInput.max = 9999;
    minPlayersInput.title = 'min Players to roll';
    minPlayersInput.value = this.minPlayers;
    minPlayersInput.addEventListener('input', () => {
      this.minPlayers = parseInt(minPlayersInput.value);
    });

    container.appendChild(possibleWinnersInput);
    container.appendChild(minPlayersInput);
    container.appendChild(lotteryButton);
    container.appendChild(dataContainer);
    container.appendChild(statusContainer);

    this.fetchPlayerData().then(() => {
      this.renderPlayerData(dataContainer);
    });
  }
}

export default Plugin;
