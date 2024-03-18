import type { EthAddress, LocationId } from './identifier';

/**
 * Represents a player; corresponds fairly closely with the analogous contract
 * struct
 */
export type Player = {
  address: EthAddress;
  twitter?: string;
  /**
   * seconds (not millis)
   */
  initTimestamp: number;
  homePlanetId: LocationId;
  /**
   * seconds (not millis)
   */
  lastRevealTimestamp: number;
  lastClaimTimestamp: number;
  lastBurnTimestamp: number;
  lastActivateArtifactTimestamp: number;
  lastBuyArtifactTimestamp: number;
  lastKardashevTimestamp: number;

  score?: number;

  spaceJunk: number;
  spaceJunkLimit: number;
  claimedShips: boolean;
  finalRank: number;
  claimedReward: boolean;
  activateArtifactAmount: number;
  buyArtifactAmount: number;
  silver: number;
  dropBombAmount: number;
  pinkAmount: number;
  pinkedAmount: number;
  moveCount: number;
  hatCount: number;
  kardashevAmount: number;
  buyPlanetId: LocationId;
  buySpaceshipAmount: number;
};
