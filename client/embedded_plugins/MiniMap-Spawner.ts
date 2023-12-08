// Mini-Map Plugin
//
// Use at your own risk!
//
// This plugin:
// 1) Samples the entire map in a grid
// 2) Determines the space type at each coordinate
// 3) Renders a rough map of every inner nebula, outer nebula, and deep space
// 4) Overlays the viewport and home location
// 5) Re-centers the viewport around the location clicked on the mini-map
// 6) Adds spawn rate circles (always active)
// 7) Generates Dark Forest planets with concentric circles
import {
  locationIdFromDecStr,
  //@ts-ignore
} from "https://cdn.skypack.dev/@dfares/serde";
class Plugin {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.minDensity = 1000;
    this.maxDensity = 10000;
    this.spawnRateCirclesVisible = true;
    this.planets = [];
    this.planetsInput = document.createElement("input"); // New input element
    this.distanceThreshold = 3500;
    this.planetsInput.value = 15;
    this.revealed = true;
  }

  async render(div) {
    // Default values
    div.style.width = "400px";
    div.style.height = "180px";
    div.style.maxWidth = "1200px";
    div.style.maxHeight = "1200px";

    const radius = ui.getWorldRadius();
    let step = 1800;
    let dot = 4;
    let canvasSize = 400;
    let sizeFactor = 500;
    let centerZone = 1000;
    let maxDistance = 20000;

    console.log("Curent game radius:", radius);
    // Utility functions
    const normalize = (val) => {
      return Math.floor(((val + radius) * sizeFactor) / (radius * 2));
    };

    const toPixels = (val) => {
      return Math.floor((val * sizeFactor) / (radius * 2));
    };

    const toWorldCoord = (val) => {
      return Math.floor((val * radius * 2) / sizeFactor - radius);
    };

    const checkBounds = (a, b, x, y, r) => {
      let dist = (a - x) * (a - x) + (b - y) * (b - y);
      r *= r;
      if (dist < r) {
        return true;
      }
      return false;
    };

    // Draw spawn rate circles (always active)
    const drawSpawnRateCircles = (density) => {
      const ctx = this.canvas.getContext("2d");

      if (this.spawnRateCirclesVisible) {
        const spawnRateCircles = [
          { spawnRate: 6, color: "rgba(255, 255, 0, 0.2)" }, // Inner circle
          { spawnRate: 4, color: "rgba(255, 255, 0, 0.2)" }, // Middle circle
          { spawnRate: 2, color: "rgba(255, 255, 0, 0.2)" }, // Outer circle
        ];

        const circleCenter = {
          x: normalize(0) + 12,
          y: normalize(0 * -1) + 12,
        };

        spawnRateCircles.forEach((circle) => {
          const circleRadius =
            normalize((centerZone / 3) * circle.spawnRate * density) / 5;

          ctx.beginPath();
          ctx.arc(
            circleCenter.x,
            circleCenter.y,
            circleRadius / 4,
            0,
            2 * Math.PI
          );
          ctx.fillStyle = circle.color;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255, 255, 0, 0.5)";
          ctx.stroke();
        });
      }
    };

    // Function to delete a planet from the list
    const deletePlanet = (index) => {
      this.planets.splice(index, 1);
      refreshMap(); // Refresh both mini-map and planet list after deletion
    };

    // Function to refresh the mini-map and planet list
    const refreshMap = () => {
      generate();
      drawSpawnRateCircles(maxDistance / 100);
      refreshPlanetList();
    };

    // Function to refresh the planet list
    const refreshPlanetList = () => {
      const ctx = this.canvas.getContext("2d");

      // Sort planets based on distance to [0, 0] in descending order
      this.planets.sort((planetA, planetB) => {
        const distanceA = Math.sqrt(
          Math.pow(planetA.coordinates[0], 2) +
            Math.pow(planetA.coordinates[1], 2)
        );
        const distanceB = Math.sqrt(
          Math.pow(planetB.coordinates[0], 2) +
            Math.pow(planetB.coordinates[1], 2)
        );

        return distanceA - distanceB;
      });

      // Clear only the area where red dots are drawn
      this.planets.forEach((planet) => {
        const [x, y] = planet.coordinates;
        const normalizedX = normalize(x) + 12;
        const normalizedY = normalize(y * -1) + 12;
        ctx.clearRect(normalizedX, normalizedY, 2, 2);
      });

      ctx.fillStyle = "#FF0000"; // Red dot for planets
      this.planets.forEach((planet) => {
        const [x, y] = planet.coordinates;
        const normalizedX = normalize(x) + 12;
        const normalizedY = normalize(y * -1) + 12;
        ctx.fillRect(normalizedX, normalizedY, 2, 2);
      });

      // Clear the previous planet list
      const planetList = document.getElementById("planet-list");
      if (planetList) {
        div.removeChild(planetList);
      }

      // Create a new list of added planets with coordinates and levels
      const newPlanetList = document.createElement("ul");
      newPlanetList.setAttribute("id", "planet-list");
      newPlanetList.style.listStyleType = "none";
      newPlanetList.style.padding = "0";

      this.planets.forEach((planet, index) => {
        const listItem = document.createElement("li");
        listItem.style.cursor = "pointer";
        listItem.innerText = `Planet ${index + 1} - Level ${
          planet.level
        } -[${planet.coordinates[0].toFixed(
          0
        )}, ${planet.coordinates[1].toFixed(0)}]`;

        // Add a delete button to each planet row
        const deleteButton = document.createElement("button");
        deleteButton.innerText = "Delete";
        deleteButton.style.marginLeft = "10px";
        deleteButton.addEventListener("click", () => {
          deletePlanet(index);
        });

        listItem.appendChild(deleteButton);

        listItem.addEventListener("click", () => {
          // Center main viewport on the clicked planet
          ui.centerCoords({
            x: planet.coordinates[0],
            y: planet.coordinates[1],
          });
        });

        newPlanetList.appendChild(listItem);
      });

      div.appendChild(newPlanetList);
    };

    // ui elements
    const getButton = document.createElement("button");
    getButton.innerText = "generate map";
    getButton.style.marginBottom = "10px";
    getButton.style.marginRight = "7px";
    getButton.addEventListener("click", async () => {
      generateDarkForestPlanets(this.planetsInput.value); // Pass the input value
    });
    // sample points in a grid and determine space type
    const generate = () => {
      div.style.width = "100%";
      div.style.height = "100%";
      this.canvas.width = canvasSize;
      this.canvas.height = canvasSize;
      sizeFactor = canvasSize - 20;
      let data = [];

      // generate x coordinates
      for (let i = radius * -1; i < radius; i += step) {
        // generate y coordinates
        for (let j = radius * -1; j < radius; j += step) {
          // filter points within map circle
          if (checkBounds(0, 0, i, j, radius)) {
            // store coordinate and space type
            data.push({
              x: i,
              y: j,
              type: df.spaceTypeFromPerlin(df.spaceTypePerlin({ x: i, y: j })),
            });
          }
        }
      }

      // draw mini-map
      const ctx = this.canvas.getContext("2d");

      for (let i = 0; i < data.length; i++) {
        if (data[i].type === 0) {
          ctx.fillStyle = "#21215d"; // inner nebula
        } else if (data[i].type === 1) {
          ctx.fillStyle = "#24247d"; // outer nebula
        } else if (data[i].type === 2) {
          ctx.fillStyle = "#000000"; // deep space
        } else if (data[i].type === 3) {
          ctx.fillStyle = "#460046"; // Corrupted slightly brighter for better visibility
        }
        ctx.fillRect(
          normalize(data[i].x) + 10,
          normalize(data[i].y * -1) + 10,
          dot,
          dot
        );
      }

      // draw larger white pixel at home coordinates
      const home = df.getHomeCoords();
      ctx.fillStyle = "#DDDDDD";
      ctx.fillRect(normalize(home.x), normalize(home.y * -1), dot + 2, dot + 2);

      // draw extents of map
      let radiusNormalized = normalize(radius) / 2;

      ctx.beginPath();
      ctx.arc(
        radiusNormalized + 12,
        radiusNormalized + 12,
        radiusNormalized,
        0,
        2 * Math.PI
      );
      ctx.strokeStyle = "#DDDDDD";
      ctx.lineWidth = 2;
      ctx.stroke();

      // draw initial viewport extents
      const topLeft = ui.getViewport().canvasToWorldCoords({ x: 0, y: 0 });
      ctx.strokeStyle = "#DDDDDD";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        normalize(topLeft.x),
        normalize(topLeft.y * -1),
        Math.floor(toPixels(ui.getViewport().widthInWorldUnits)),
        Math.floor(toPixels(ui.getViewport().heightInWorldUnits))
      );

      // recenter viewport based on click location
      this.canvas.style = "cursor: pointer;";

      this.canvas.addEventListener(
        "click",
        function (event) {
          let x = event.offsetX;
          let y = event.offsetY;
          let xWorld = toWorldCoord(x);
          let yWorld = toWorldCoord(y) * -1;

          ui.centerCoords({ x: xWorld, y: yWorld });
        },
        false
      );
    };

    this.planetsInput.type = "number";
    this.planetsInput.placeholder = "Planets";
    this.planetsInput.style.marginTop = "10px";
    this.planetsInput.style.width = "20%";
    this.planetsInput.style.marginRight = "5px"; // Add padding

    // Function to generate Dark Forest planets with concentric circles
    const generateMapWithinCircles = (numPlanets, existingPlanets) => {
      const universeCenter = [0, 0];
      let _existingPlanets = existingPlanets;

      const planets = [];

      // Function to generate a random number within a range
      const getRandomInRange = (min, max) => {
        return Math.random() * (max - min) + min;
      };

      for (let i = 0; i < numPlanets; i = i) {
        const distanceFromCenter = getRandomInRange(0, maxDistance);
        const angle = getRandomInRange(0, 2 * Math.PI);

        // Calculate planet coordinates based on polar coordinates
        const x = universeCenter[0] + distanceFromCenter * Math.cos(angle);
        const y = universeCenter[1] + distanceFromCenter * Math.sin(angle);

        // Calculate planet level based on distance from the center and circles
        let spawnRate = 1;
        let level = 5;

        // Get space type at the generated coordinates
        const spaceType = df.spaceTypeFromPerlin(df.spaceTypePerlin({ x, y }));

        // Check if the space type is inner nebula (0) or outer nebula (1)
        if (spaceType === 0 || spaceType === 1) {
          continue; // Skip adding the planet for inner and outer nebula
        }

        if (distanceFromCenter < maxDistance / 3) {
          // Inner circle
          spawnRate = 2;
          level = Math.floor(
            8 + (distanceFromCenter / (maxDistance / 3)) * spawnRate
          ); // Levels 8 to 9
        } else if (distanceFromCenter < (2 * maxDistance) / 3) {
          // Middle circle
          spawnRate = 1.5;
          level = Math.floor(
            6 + (distanceFromCenter / (maxDistance / 3)) * spawnRate
          ); // Levels 7 to 8
        } else {
          // Outer circle
          spawnRate = 0.5;
          level = Math.floor(
            6 + (distanceFromCenter / (maxDistance / 3)) * spawnRate
          ); // Levels 6 to 8
        }

        // Adjust level to be within the specified range
        level = Math.min(9, Math.max(6, level));

        // Check distance to existing planets using global variable
        let tooClose = false;
        for (const existingPlanet of _existingPlanets) {
          const distance = Math.sqrt(
            Math.pow(x - existingPlanet.coordinates[0], 2) +
              Math.pow(y - existingPlanet.coordinates[1], 2)
          );

          if (distance < this.distanceThreshold) {
            tooClose = true;
            break;
          }
        }

        // Apply spawn rate and check distance
        if (Math.random() < spawnRate && !tooClose) {
          planets.push({ coordinates: [x, y], level });
          i += 1;
        }
        _existingPlanets = planets;
      }

      return planets;
    };

    // Modify the function to update the global variable when the input changes
    const updateDistanceThreshold = (value) => {
      this.distanceThreshold = value;
    };

    // Function to create a planet, spawn it, and delete it from the list
    const createSpawnAndDeletePlanet = async (planet, index) => {
      const { coordinates, level } = planet;

      // Assuming you have the necessary functions and variables defined elsewhere
      const coords = { x: coordinates[0], y: coordinates[1] };

      const type = 0;
      try {
        await this.createPlanet(coords, level, type);
        await new Promise((resolve) => setTimeout(resolve, 300));
        // Delete the planet from the list after confirmation
        this.planets.splice(index, 1);
        await new Promise((resolve) => setTimeout(resolve, 100));
        refreshMap();
      } catch (error) {
        console.error("Error during planet creation and spawn:", error);
      }
    };

    // Function to generate Dark Forest planets and display them on the mini-map
    const generateDarkForestPlanets = (numPlanets) => {
      this.planets = generateMapWithinCircles(numPlanets, this.planets);
      refreshMap();
    };

    // Add an input element to set the distance threshold
    const distanceInput = document.createElement("input");
    distanceInput.type = "number";
    distanceInput.value = this.distanceThreshold;
    distanceInput.style.width = "20%";
    distanceInput.style.marginRight = "5px"; // Add padding
    distanceInput.addEventListener("input", (event) => {
      updateDistanceThreshold(parseInt(event.target.value, 10));
    });

    // Add a global button to spawn all planets
    const spawnAllButton = document.createElement("button");
    spawnAllButton.innerText = "Spawn All Planets";
    spawnAllButton.addEventListener("click", async () => {
      // Iterate through the list of planets and spawn each one
      for (let i = 0; i < this.planets.length; i++) {
        await createSpawnAndDeletePlanet(this.planets[i], i);
      }
    });

    this.refreshPlanetList = refreshMap; // Assign the function to the class property
    generate();
    drawSpawnRateCircles();

    div.appendChild(getButton);
    div.appendChild(this.planetsInput); // Append the input element
    // Add the input element to the HTML
    div.appendChild(distanceInput);
    div.appendChild(spawnAllButton);
    div.appendChild(this.canvas);
  }

  async createPlanet(coords, level, type) {
    try {
      coords.x = Math.round(coords.x);
      coords.y = Math.round(coords.y);

      const location = df.locationBigIntFromCoords(coords).toString();
      const perlinValue = df.biomebasePerlin(coords, true);

      const args = Promise.resolve([
        {
          x: coords.x,
          y: coords.y,
          level,
          planetType: type,
          requireValidLocationId: false,
          location: location,
          perlin: perlinValue,
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const tx = await df.submitTransaction({
        args,
        contract: df.getContract(),
        methodName: "createPlanet",
      });

      await tx.confirmedPromise;
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!this.revealed) {
        const revealArgs = df
          .getSnarkHelper()
          .getRevealArgs(coords.x, coords.y);
        const revealTx = await df.submitTransaction({
          args: revealArgs,
          contract: df.getContract(),
          methodName: "revealLocation",
        });

        await revealTx.confirmedPromise;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await df.hardRefreshPlanet(locationIdFromDecStr(location));
      // Add a delay of 100 milliseconds
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error("Error during planet creation and spawn:", error);
    }
  }

  destroy() {
    const ctx = this.canvas.getContext("2d");
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

export default Plugin;
