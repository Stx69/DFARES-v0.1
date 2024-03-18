// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;
// External contract imports
import {DFArtifactFacet} from "./DFArtifactFacet.sol";

// Library imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";
import {LibGameUtils} from "../libraries/LibGameUtils.sol";

// Storage imports
import {WithStorage, GameConstants} from "../libraries/LibStorage.sol";

// Type imports
import {Artifact, ArtifactWithMetadata, RevealedCoords, ClaimedCoords, BurnedCoords, LastClaimedStruct, LastBurnedStruct, LastActivateArtifactStruct, LastBuyArtifactStruct, KardashevCoords, LastKardashevStruct} from "../DFTypes.sol";

contract DFGetterTwoFacet is WithStorage {
    /**
     * Get a group or artifacts based on their index, fetch all between startIdx & endIdx.
     Indexes are assigned to artifacts based on the order in which they are minted.
     * index 0 would be the first Artifact minted, etc.
     * @param startIdx index of the first element to get
     * @param endIdx index of the last element to get
     */
    function bulkGetArtifacts(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (ArtifactWithMetadata[] memory ret)
    {
        ret = new ArtifactWithMetadata[](endIdx - startIdx);

        for (uint256 i = startIdx; i < endIdx; i++) {
            Artifact memory artifact = DFArtifactFacet(address(this)).getArtifactAtIndex(i);
            address owner = address(0);

            try DFArtifactFacet(address(this)).ownerOf(artifact.id) returns (address addr) {
                owner = addr;
            } catch Error(string memory) {
                // artifact is probably burned or owned by 0x0, so owner is 0x0
            } catch (bytes memory) {
                // this shouldn't happen
            }
            ret[i - startIdx] = ArtifactWithMetadata({
                artifact: artifact,
                upgrade: LibGameUtils._getUpgradeForArtifact(artifact),
                timeDelayedUpgrade: LibGameUtils.timeDelayUpgrade(artifact),
                owner: owner,
                locationId: gs().artifactIdToPlanetId[artifact.id],
                voyageId: gs().artifactIdToVoyageId[artifact.id]
            });
        }
    }

    //About Claim
    function CLAIM_END_TIMESTAMP() public view returns (uint256) {
        return gameConstants().CLAIM_END_TIMESTAMP;
    }

    function claimedCoords(uint256 key) public view returns (ClaimedCoords memory) {
        return gs().claimedCoords[key];
    }

    /**
     * Returns the total amount of planets that have been claimed. A planet does not get counted
     * more than once if it's been claimed by multiple people.
     */
    function getNClaimedPlanets() public view returns (uint256) {
        return gs().claimedIds.length;
    }

    /**
     * API for loading a sublist of the set of claimed planets, so that clients can download this
     * info without DDOSing xDai.
     */
    function bulkGetClaimedPlanetIds(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (uint256[] memory ret)
    {
        // return slice of revealedPlanetIds array from startIdx through endIdx - 1
        ret = new uint256[](endIdx - startIdx);
        for (uint256 i = startIdx; i < endIdx; i++) {
            ret[i - startIdx] = gs().claimedIds[i];
        }
    }

    /**
     * API for loading a sublist of the set of claimed planets, so that clients can download this
     * info without DDOSing xDai.
     */
    function bulkGetClaimedCoordsByIds(uint256[] calldata ids)
        public
        view
        returns (ClaimedCoords[] memory ret)
    {
        ret = new ClaimedCoords[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            ret[i] = gs().claimedCoords[ids[i]];
        }
    }

    function bulkGetLastClaimTimestamp(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (LastClaimedStruct[] memory ret)
    {
        ret = new LastClaimedStruct[](endIdx - startIdx);

        for (uint256 i = startIdx; i < endIdx; i++) {
            address player = gs().playerIds[i];
            ret[i - startIdx] = LastClaimedStruct({
                player: player,
                lastClaimTimestamp: gs().lastClaimTimestamp[player]
            });
        }
    }

    /**
     * Returns the last time that the given player claimed a planet.
     */
    function getLastClaimTimestamp(address player) public view returns (uint256) {
        return gs().lastClaimTimestamp[player];
    }

    //About Drop Bomb to Burn Planet
    function BURN_END_TIMESTAMP() public view returns (uint256) {
        return gameConstants().BURN_END_TIMESTAMP;
    }

    function burnedCoords(uint256 key) public view returns (BurnedCoords memory) {
        return gs().burnedCoords[key];
    }

    /**
     * Returns the total amount of planets that have been burned.
     * A planet can only be dropped by one bomb.
     */
    function getNBurnedPlanets() public view returns (uint256) {
        return gs().burnedIds.length;
    }

    /**
     * API for loading a sublist of the set of burned planets, so that clients can download this
     * info without DDOSing xDai.
     */
    function bulkGetBurnedPlanetIds(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (uint256[] memory ret)
    {
        // return slice of revealedPlanetIds array from startIdx through endIdx - 1
        ret = new uint256[](endIdx - startIdx);
        for (uint256 i = startIdx; i < endIdx; i++) {
            ret[i - startIdx] = gs().burnedIds[i];
        }
    }

    /**
     * API for loading a sublist of the set of claimed planets, so that clients can download this
     * info without DDOSing xDai.
     */
    function bulkGetBurnedCoordsByIds(uint256[] calldata ids)
        public
        view
        returns (BurnedCoords[] memory ret)
    {
        ret = new BurnedCoords[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            ret[i] = gs().burnedCoords[ids[i]];
        }
    }

    function bulkGetLastBurnTimestamp(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (LastBurnedStruct[] memory ret)
    {
        ret = new LastBurnedStruct[](endIdx - startIdx);

        for (uint256 i = startIdx; i < endIdx; i++) {
            address player = gs().playerIds[i];

            ret[i - startIdx] = LastBurnedStruct({
                player: player,
                lastBurnTimestamp: gs().lastBurnTimestamp[player]
            });
        }
    }

    /**
     * Returns the last time that the given player dropped a bomb.
     */
    function getLastBurnTimestamp(address player) public view returns (uint256) {
        return gs().lastBurnTimestamp[player];
    }

    function bulkGetLastActivateArtifactTimestamp(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (LastActivateArtifactStruct[] memory ret)
    {
        ret = new LastActivateArtifactStruct[](endIdx - startIdx);

        for (uint256 i = startIdx; i < endIdx; i++) {
            address player = gs().playerIds[i];

            ret[i - startIdx] = LastActivateArtifactStruct({
                player: player,
                lastActivateArtifactTimestamp: gs().lastActivateArtifactTimestamp[player]
            });
        }
    }

    /**
     * Returns the last time that the given player activated artifact
     */
    function getLastActivateArtifactTimestamp(address player) public view returns (uint256) {
        return gs().lastActivateArtifactTimestamp[player];
    }

    function bulkGetLastBuyArtifactTimestamp(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (LastBuyArtifactStruct[] memory ret)
    {
        ret = new LastBuyArtifactStruct[](endIdx - startIdx);

        for (uint256 i = startIdx; i < endIdx; i++) {
            address player = gs().playerIds[i];

            ret[i - startIdx] = LastBuyArtifactStruct({
                player: player,
                lastBuyArtifactTimestamp: gs().lastBuyArtifactTimestamp[player]
            });
        }
    }

    // Kardashev
    function KARDASHEV_END_TIMESTAMP() public view returns (uint256) {
        return gameConstants().KARDASHEV_END_TIMESTAMP;
    }

    function kardashevCoords(uint256 key) public view returns (KardashevCoords memory) {
        return gs().kardashevCoords[key];
    }

    function getNKardashevPlanets() public view returns (uint256) {
        return gs().kardashevIds.length;
    }

    function bulkGetKardashevPlanetIds(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (uint256[] memory ret)
    {
        ret = new uint256[](endIdx - startIdx);
        for (uint256 i = startIdx; i < endIdx; i++) {
            ret[i - startIdx] = gs().kardashevIds[i];
        }
    }

    function bulkGetKardashevCoordsByIds(uint256[] calldata ids)
        public
        view
        returns (KardashevCoords[] memory ret)
    {
        ret = new KardashevCoords[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            ret[i] = gs().kardashevCoords[ids[i]];
        }
    }

    function bulkGetLastKardashevTimestamp(uint256 startIdx, uint256 endIdx)
        public
        view
        returns (LastKardashevStruct[] memory ret)
    {
        ret = new LastKardashevStruct[](endIdx - startIdx);
        for (uint256 i = startIdx; i < endIdx; i++) {
            address player = gs().playerIds[i];
            ret[i - startIdx] = LastKardashevStruct({
                player: player,
                lastKardashevTimestamp: gs().lastKardashevTimestamp[player]
            });
        }
    }

    function getLastKardashevTimestamp(address player) public view returns (uint256) {
        return gs().lastBurnTimestamp[player];
    }

    function getMySpaceshipIds(address player) public view returns (uint256[] memory ret) {
        ret = gs().mySpaceshipIds[player];
    }

    /**
     * Returns the last time that the given player activated artifact
     */
    function getLastBuyArtifactTimestamp(address player) public view returns (uint256) {
        return gs().lastBuyArtifactTimestamp[player];
    }

    function getFirstMythicArtifactOwner() public view returns (address) {
        return gs().firstMythicArtifactOwner;
    }

    function getFirstBurnLocationOperator() public view returns (address) {
        return gs().firstBurnLocationOperator;
    }

    function getFirstKardashevOperator() public view returns (address) {
        return gs().firstKardashevOperator;
    }

    function getFirstHat() public view returns (address) {
        return gs().firstHat;
    }
}
