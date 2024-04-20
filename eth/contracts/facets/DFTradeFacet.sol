// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";
import {LibGameUtils} from "../libraries/LibGameUtils.sol";
import {LibPlanet} from "../libraries/LibPlanet.sol";
import {LibArtifactUtils} from "../libraries/LibArtifactUtils.sol";

// Storage imports
import {WithStorage} from "../libraries/LibStorage.sol";
import {DFWhitelistFacet} from "./DFWhitelistFacet.sol";

//Type imports
import {Planet, Player, SpaceType, ArtifactType, Artifact} from "../DFTypes.sol";

contract DFTradeFacet is WithStorage {
    event PlayerDonate(address player, uint256 amount);
    event PlanetBought(address player, uint256 loc);
    event SpaceshipBought(uint256 locationId, address owner, ArtifactType artifactType);

    modifier notPaused() {
        require(!gs().paused, "Game is paused");
        _;
    }

    modifier onlyWhitelisted() {
        require(
            DFWhitelistFacet(address(this)).isWhitelisted(msg.sender) ||
                msg.sender == LibDiamond.contractOwner(),
            "Player is not whitelisted"
        );
        _;
    }

    /**
     * Sets the owner of the given planet, even if it's not initialized (which is why
     * it requires the same snark arguments as DFCoreFacet#initializePlanet).
     */

    function buyPlanet(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[9] memory _input
    ) public payable onlyWhitelisted notPaused {
        uint256 planetId = _input[0];

        if (!gs().planets[planetId].isInitialized) {
            LibPlanet.initializePlanet(_a, _b, _c, _input, false);
        }

        Planet storage planet = gs().planets[planetId];
        Player storage player = gs().players[msg.sender];
        uint256 _location = _input[0];
        uint256 _perlin = _input[1];
        uint256 _radius = _input[2];
        uint256 _distFromOriginSquare = _input[8];

        // player requirements
        require(player.isInitialized, "player need to be initialized before");
        //NOTE: using this way is easier
        uint256 MAX_BUY_PLANET_AMOUNT = 6;
        require(player.buyPlanetAmount < MAX_BUY_PLANET_AMOUNT, "buy planet amount limit");

        if (!ws().enabled) {
            require(ws().allowedAccounts[msg.sender], "player is already allowed");
        }

        // planet requirements
        require(planet.planetLevel == 0, "only level 0");
        require(planet.owner == address(0), "no owner before");
        require(_radius <= gs().worldRadius, "Init radius is bigger than the current world radius");

        uint256[5] memory MAX_LEVEL_DIST = gameConstants().MAX_LEVEL_DIST;
        require(_radius > MAX_LEVEL_DIST[1], "Player can only spawn at the edge of universe");

        SpaceType spaceType = LibGameUtils.spaceTypeFromPerlin(_perlin, _distFromOriginSquare);
        require(spaceType == SpaceType.NEBULA, "Only NEBULA");

        // NOTE: the same as checkPlayerInit function
        //
        // if (gameConstants().SPAWN_RIM_AREA != 0) {
        //     require(
        //         (_radius**2 * 314) / 100 + gameConstants().SPAWN_RIM_AREA >=
        //             (gs().worldRadius**2 * 314) / 100,
        //         "Player can only spawn at the universe rim"
        //     );
        // }
        // require(
        //     _perlin >= gameConstants().INIT_PERLIN_MIN,
        //     "Init not allowed in perlin value less than INIT_PERLIN_MIN"
        // );
        // require(
        //     _perlin < gameConstants().INIT_PERLIN_MAX,
        //     "Init not allowed in perlin value greater than or equal to the INIT_PERLIN_MAX"
        // );

        // price
        uint256 fee = 0.003 ether; // 0.003 eth
        fee = fee * (2**player.buyPlanetAmount);
        if (gs().halfPrice) fee = fee / 2;

        require(msg.value == fee, "Wrong value sent");

        player.buyPlanetAmount++;

        planet.owner = msg.sender;
        planet.population = planet.populationCap;
        LibGameUtils.updateWorldRadius();
        emit PlanetBought(msg.sender, planetId);
    }

    function buySpaceship(uint256 locationId, ArtifactType artifactType) public payable notPaused {
        require(gs().planets[locationId].isInitialized, "planet is not initialized");
        require(LibArtifactUtils.isSpaceship(artifactType), "artifact type must be a space ship");
        require(artifactType == ArtifactType.ShipWhale, "only whale");

        //todo: may change another value
        require(gs().players[msg.sender].buySpaceshipAmount < 3, "max buy 3 spaceships");

        // price
        uint256 fee = 0.001 ether; // 0.001 eth
        if (gs().halfPrice) fee = fee / 2;
        require(msg.value == fee, "Wrong value sent");

        // about spaceship
        uint256 shipId = LibArtifactUtils.createAndPlaceSpaceship(
            locationId,
            msg.sender,
            artifactType
        );
        Artifact storage artifact = gs().artifacts[shipId];
        Planet memory planet = gs().planets[locationId];
        //about planet
        require(planet.owner == msg.sender, "only allow planet owner");

        planet = LibPlanet.applySpaceshipArrive(artifact, planet);

        Player storage player = gs().players[msg.sender];
        player.buySpaceshipAmount++;

        gs().planets[locationId] = planet;
        gs().mySpaceshipIds[msg.sender].push(shipId);

        emit SpaceshipBought(locationId, msg.sender, artifactType);
    }

    function donate(uint256 amount) public payable {
        require(amount > 0, "amount gt 0");
        require(amount * 0.001 ether == msg.value, "Wrong value sent");
        gs().players[msg.sender].donationAmount += amount;
        emit PlayerDonate(msg.sender, amount);
    }
}
