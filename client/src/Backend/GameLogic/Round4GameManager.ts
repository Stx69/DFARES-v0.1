import { monomitter, Monomitter } from '@dfares/events';
import { isLocatable } from '@dfares/gamelogic';
import { EthConnection, ThrottledConcurrentQueue } from '@dfares/network';
import {
  isUnconfirmedAcceptApplicationTx,
  isUnconfirmedAcceptInviteTx,
  isUnconfirmedActivateArtifactTx,
  isUnconfirmedBlueTx,
  isUnconfirmedBurnTx,
  isUnconfirmedBuyArtifactTx,
  isUnconfirmedBuyHatTx,
  isUnconfirmedBuyPlanetTx,
  isUnconfirmedBuySpaceshipTx,
  isUnconfirmedCancelApplicationTx,
  isUnconfirmedCancelInviteTx,
  isUnconfirmedCapturePlanetTx,
  isUnconfirmedChangeArtifactImageTypeTx,
  isUnconfirmedChangeUnionNameTx,
  isUnconfirmedClaimTx,
  isUnconfirmedCreateUnionTx,
  isUnconfirmedDeactivateArtifactTx,
  isUnconfirmedDepositArtifactTx,
  isUnconfirmedDisbandUnionTx,
  isUnconfirmedFindArtifactTx,
  isUnconfirmedInitTx,
  isUnconfirmedInvadePlanetTx,
  isUnconfirmedInviteMemberTx,
  isUnconfirmedKardashevTx,
  isUnconfirmedKickMemberTx,
  isUnconfirmedLeaveUnionTx,
  isUnconfirmedLevelUpUnionTx,
  isUnconfirmedMoveTx,
  isUnconfirmedPinkTx,
  isUnconfirmedProspectPlanetTx,
  isUnconfirmedRefreshPlanetTx,
  isUnconfirmedRejectApplicationTx,
  isUnconfirmedRevealTx,
  isUnconfirmedSendApplicationTx,
  isUnconfirmedTransferLeaderRoleTx,
  isUnconfirmedUpgradeTx,
  isUnconfirmedWithdrawArtifactTx,
  isUnconfirmedWithdrawSilverTx,
} from '@dfares/serde';
import {
  Artifact,
  ArtifactId,
  ArtifactType,
  BurnedCoords,
  ClaimedCoords,
  EthAddress,
  KardashevCoords,
  LocationId,
  Planet,
  Player,
  QueuedArrival,
  RevealedCoords,
  Setting,
  Transaction,
  UnconfirmedAcceptApplication,
  UnconfirmedAcceptInvite,
  UnconfirmedAddMemberByAdmin,
  UnconfirmedCancelApplication,
  UnconfirmedCancelInvite,
  UnconfirmedChangeUnionName,
  UnconfirmedCreateUnion,
  UnconfirmedDisbandUnion,
  UnconfirmedInviteMember,
  UnconfirmedKickMember,
  UnconfirmedLeaveUnion,
  UnconfirmedLevelUpUnion,
  UnconfirmedRejectApplication,
  UnconfirmedSendApplication,
  UnconfirmedTransferLeaderRole,
  Union,
  UnionId,
  VoyageId,
  WorldLocation,
} from '@dfares/types';
import delay from 'delay';
import NotificationManager from '../../Frontend/Game/NotificationManager';
import { pollSetting } from '../../Frontend/Utils/SettingsHooks';
import { TerminalHandle } from '../../Frontend/Views/Terminal';
import {
  ContractConstants,
  ContractsAPIEvent,
} from '../../_types/darkforest/api/ContractsAPITypes';
import { HashConfig } from '../../_types/global/GlobalTypes';
import PersistentChunkStore from '../Storage/PersistentChunkStore';
import SnarkArgsHelper from '../Utils/SnarkArgsHelper';
import BaseGameManager, { GameManagerEvent } from './BaseGameManager';
import { ContractsAPI, makeContractsAPI } from './ContractsAPI';
import { InitialGameStateDownloader } from './InitialGameStateDownloader';

class Round4GameManager extends BaseGameManager {
  /**
   * Map from union Ids to Union objects. This isn't stored in {@link GameObjects},
   * because it's not techincally an entity that exists in the world. A player just controls planets
   * and artifacts that do exist in the world.
   *
   * @todo move this into a new `Union` class.
   */
  private readonly unions: Map<UnionId, Union>;

  /**
   * Whenever we refresh the unions, we publish an event here.
   */
  public readonly unionsUpdated$: Monomitter<void>;

  /**
   * Handle to an interval that periodically refreshes some information about the union from the
   * blockchain.
   *
   * @todo move this into a new `UnionState` class.
   */
  // private unionInterval: ReturnType<typeof setInterval>;

  protected constructor(
    terminal: React.MutableRefObject<TerminalHandle | undefined>,
    account: EthAddress | undefined,
    players: Map<string, Player>,
    touchedPlanets: Map<LocationId, Planet>,
    allTouchedPlanetIds: Set<LocationId>,
    revealedCoords: Map<LocationId, RevealedCoords>,
    claimedCoords: Map<LocationId, ClaimedCoords>,
    burnedCoords: Map<LocationId, BurnedCoords>,
    kardashevCoords: Map<LocationId, KardashevCoords>,
    worldRadius: number,
    unprocessedArrivals: Map<VoyageId, QueuedArrival>,
    unprocessedPlanetArrivalIds: Map<LocationId, VoyageId[]>,
    contractsAPI: ContractsAPI,
    contractConstants: ContractConstants,
    persistentChunkStore: PersistentChunkStore,
    snarkHelper: SnarkArgsHelper,
    homeLocation: WorldLocation | undefined,
    useMockHash: boolean,
    artifacts: Map<ArtifactId, Artifact>,
    ethConnection: EthConnection,
    paused: boolean,
    halfPrice: boolean,
    unions: Map<UnionId, Union>
  ) {
    super(
      terminal,
      account,
      players,
      touchedPlanets,
      allTouchedPlanetIds,
      revealedCoords,
      claimedCoords,
      burnedCoords,
      kardashevCoords,
      worldRadius,
      unprocessedArrivals,
      unprocessedPlanetArrivalIds,
      contractsAPI,
      contractConstants,
      persistentChunkStore,
      snarkHelper,
      homeLocation,
      useMockHash,
      artifacts,
      ethConnection,
      paused,
      halfPrice
    );

    this.unions = unions;

    this.unionsUpdated$ = monomitter();
  }

  static async create({
    connection,
    terminal,
    contractAddress,
    spectate = false,
  }: {
    connection: EthConnection;
    terminal: React.MutableRefObject<TerminalHandle | undefined>;
    contractAddress: EthAddress;
    spectate: boolean;
  }): Promise<Round4GameManager> {
    if (!terminal.current) {
      throw new Error('you must pass in a handle to a terminal');
    }

    const account = spectate
      ? <EthAddress>'0x0000000000000000000000000000000000000001'
      : connection.getAddress();

    if (!account) {
      throw new Error('no account on eth connection');
    }

    const gameStateDownloader = new InitialGameStateDownloader(terminal.current);
    const contractsAPI = await makeContractsAPI({ connection, contractAddress });

    terminal.current?.println('Loading game data from disk...');

    const persistentChunkStore = await PersistentChunkStore.create({ account, contractAddress });

    terminal.current?.println('Downloading data from Ethereum blockchain...');
    terminal.current?.println('(the contract is very big. this may take a while)');
    terminal.current?.newline();

    const initialState = await gameStateDownloader.download(contractsAPI, persistentChunkStore);

    const possibleHomes = await persistentChunkStore.getHomeLocations();

    terminal.current?.println('');
    terminal.current?.println('Building Index...');

    await persistentChunkStore.saveTouchedPlanetIds(initialState.allTouchedPlanetIds);
    await persistentChunkStore.saveRevealedCoords(initialState.allRevealedCoords);
    await persistentChunkStore.saveClaimedCoords(initialState.allClaimedCoords);

    const knownArtifacts: Map<ArtifactId, Artifact> = new Map();

    for (let i = 0; i < initialState.loadedPlanets.length; i++) {
      const planet = initialState.touchedAndLocatedPlanets.get(initialState.loadedPlanets[i]);

      if (!planet) {
        continue;
      }

      planet.heldArtifactIds = initialState.heldArtifacts[i].map((a) => a.id);

      for (const heldArtifact of initialState.heldArtifacts[i]) {
        knownArtifacts.set(heldArtifact.id, heldArtifact);
      }
    }

    for (const myArtifact of initialState.myArtifacts) {
      knownArtifacts.set(myArtifact.id, myArtifact);
    }

    for (const artifact of initialState.artifactsOnVoyages) {
      knownArtifacts.set(artifact.id, artifact);
    }

    // figure out what's my home planet
    let homeLocation: WorldLocation | undefined = undefined;
    for (const loc of possibleHomes) {
      if (initialState.allTouchedPlanetIds.includes(loc.hash)) {
        homeLocation = loc;
        await persistentChunkStore.confirmHomeLocation(loc);
        break;
      }
    }

    const hashConfig: HashConfig = {
      planetHashKey: initialState.contractConstants.PLANETHASH_KEY,
      spaceTypeKey: initialState.contractConstants.SPACETYPE_KEY,
      biomebaseKey: initialState.contractConstants.BIOMEBASE_KEY,
      perlinLengthScale: initialState.contractConstants.PERLIN_LENGTH_SCALE,
      perlinMirrorX: initialState.contractConstants.PERLIN_MIRROR_X,
      perlinMirrorY: initialState.contractConstants.PERLIN_MIRROR_Y,
      planetRarity: initialState.contractConstants.PLANET_RARITY,
    };

    const useMockHash = initialState.contractConstants.DISABLE_ZK_CHECKS;
    const snarkHelper = SnarkArgsHelper.create(hashConfig, terminal, useMockHash);

    const gameManager = new Round4GameManager(
      terminal,
      account,
      initialState.players,
      initialState.touchedAndLocatedPlanets,
      new Set(Array.from(initialState.allTouchedPlanetIds)),
      initialState.revealedCoordsMap,
      initialState.claimedCoordsMap
        ? initialState.claimedCoordsMap
        : new Map<LocationId, ClaimedCoords>(),
      initialState.burnedCoordsMap
        ? initialState.burnedCoordsMap
        : new Map<LocationId, BurnedCoords>(),

      initialState.kardashevCoordsMap
        ? initialState.kardashevCoordsMap
        : new Map<LocationId, KardashevCoords>(),

      initialState.worldRadius,
      initialState.arrivals,
      initialState.planetVoyageIdMap,
      contractsAPI,
      initialState.contractConstants,
      persistentChunkStore,
      snarkHelper,
      homeLocation,
      useMockHash,
      knownArtifacts,
      connection,
      initialState.paused,
      initialState.halfPrice,
      initialState.unions
    );

    gameManager.setPlayerTwitters(initialState.twitters);

    const config = {
      contractAddress,
      account: gameManager.getAccount(),
    };
    pollSetting(config, Setting.AutoApproveNonPurchaseTransactions);

    persistentChunkStore.setDiagnosticUpdater(gameManager);
    contractsAPI.setDiagnosticUpdater(gameManager);

    // important that this happens AFTER we load the game state from the blockchain. Otherwise our
    // 'loading game state' contract calls will be competing with events from the blockchain that
    // are happening now, which makes no sense.
    contractsAPI.setupEventListeners();

    // get twitter handles
    gameManager.refreshTwitters();

    gameManager.listenForNewBlock();

    // set up listeners: whenever ContractsAPI reports some game state update, do some logic
    gameManager.contractsAPI
      .on(ContractsAPIEvent.ArtifactUpdate, async (artifactId: ArtifactId) => {
        await gameManager.hardRefreshArtifact(artifactId);
        gameManager.emit(GameManagerEvent.ArtifactUpdate, artifactId);
      })
      .on(
        ContractsAPIEvent.PlanetTransferred,
        async (planetId: LocationId, newOwner: EthAddress) => {
          await gameManager.hardRefreshPlanet(planetId);
          const planetAfter = gameManager.getPlanetWithId(planetId);

          if (planetAfter && newOwner === gameManager.account) {
            NotificationManager.getInstance().receivedPlanet(planetAfter);
          }
        }
      )
      .on(ContractsAPIEvent.PlayerUpdate, async (playerId: EthAddress) => {
        await gameManager.hardRefreshPlayer(playerId);
      })
      .on(ContractsAPIEvent.UnionUpdate, async (unionId: UnionId) => {
        await gameManager.hardRefreshUnion(unionId);
      })
      .on(ContractsAPIEvent.PauseStateChanged, async (paused: boolean) => {
        gameManager.paused = paused;
        gameManager.paused$.publish(paused);
      })
      .on(ContractsAPIEvent.HalfPriceChanged, async (halfPrice: boolean) => {
        gameManager.halfPrice = halfPrice;
        gameManager.halfPrice$.publish(halfPrice);
      })
      .on(ContractsAPIEvent.PlanetUpdate, async (planetId: LocationId) => {
        // don't reload planets that you don't have in your map. once a planet
        // is in your map it will be loaded from the contract.
        const localPlanet = gameManager.entityStore.getPlanetWithId(planetId);
        if (localPlanet && isLocatable(localPlanet)) {
          await gameManager.hardRefreshPlanet(planetId);
          gameManager.emit(GameManagerEvent.PlanetUpdate);
        }
      })
      .on(
        ContractsAPIEvent.ArrivalQueued,
        async (_arrivalId: VoyageId, fromId: LocationId, toId: LocationId) => {
          // only reload planets if the toPlanet is in the map
          const localToPlanet = gameManager.entityStore.getPlanetWithId(toId);
          if (localToPlanet && isLocatable(localToPlanet)) {
            await gameManager.bulkHardRefreshPlanets([fromId, toId]);
            gameManager.emit(GameManagerEvent.PlanetUpdate);
          }
        }
      )
      .on(
        ContractsAPIEvent.LocationRevealed,
        async (planetId: LocationId, _revealer: EthAddress) => {
          // TODO: hook notifs or emit event to UI if you want
          await gameManager.hardRefreshPlanet(planetId);
          gameManager.emit(GameManagerEvent.PlanetUpdate);
        }
      )
      .on(
        ContractsAPIEvent.LocationClaimed,
        async (planetId: LocationId, _revealer: EthAddress) => {
          // TODO: hook notifs or emit event to UI if you want

          // console.log('[testInfo]: ContractsAPIEvent.LocationClaimed');
          await gameManager.hardRefreshPlanet(planetId);
          gameManager.emit(GameManagerEvent.PlanetUpdate);
        }
      )

      .on(ContractsAPIEvent.TxQueued, (tx: Transaction) => {
        gameManager.entityStore.onTxIntent(tx);
      })
      .on(ContractsAPIEvent.TxSubmitted, (tx: Transaction) => {
        gameManager.persistentChunkStore.onEthTxSubmit(tx);
        gameManager.onTxSubmit(tx);
      })
      .on(ContractsAPIEvent.TxConfirmed, async (tx: Transaction) => {
        if (!tx.hash) return; // this should never happen
        gameManager.persistentChunkStore.onEthTxComplete(tx.hash);

        if (isUnconfirmedRevealTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedBurnTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
          await gameManager.hardRefreshPinkZones();
        } else if (isUnconfirmedPinkTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedKardashevTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
          await gameManager.hardRefreshBlueZones();
        } else if (isUnconfirmedBlueTx(tx)) {
          const centerPlanetId = gameManager.getBlueZoneCenterPlanetId(tx.intent.locationId);
          if (centerPlanetId) {
            await gameManager.bulkHardRefreshPlanets([tx.intent.locationId, centerPlanetId]);
          } else {
            // notice: this should never happen
            await gameManager.bulkHardRefreshPlanets([tx.intent.locationId]);
          }
          gameManager.emit(GameManagerEvent.PlanetUpdate);
        } else if (isUnconfirmedInitTx(tx)) {
          terminal.current?.println('Loading Home Planet from Blockchain...');
          const retries = 5;
          for (let i = 0; i < retries; i++) {
            const planet = await gameManager.contractsAPI.getPlanetById(tx.intent.locationId);
            if (planet) {
              break;
            } else if (i === retries - 1) {
              console.error("couldn't load player's home planet");
            } else {
              await delay(2000);
            }
          }
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
          // mining manager should be initialized already via joinGame, but just in case...
          gameManager.initMiningManager(tx.intent.location.coords, 4);
        } else if (isUnconfirmedMoveTx(tx)) {
          const promises = [gameManager.bulkHardRefreshPlanets([tx.intent.from, tx.intent.to])];
          if (tx.intent.artifact) {
            promises.push(gameManager.hardRefreshArtifact(tx.intent.artifact));
          }
          await Promise.all(promises);
        } else if (isUnconfirmedUpgradeTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedRefreshPlanetTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedBuyHatTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedInitTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedBuyPlanetTx(tx)) {
          //todo
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedBuySpaceshipTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedFindArtifactTx(tx)) {
          await gameManager.hardRefreshPlanet(tx.intent.planetId);
        } else if (isUnconfirmedDepositArtifactTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshPlanet(tx.intent.locationId),
            gameManager.hardRefreshArtifact(tx.intent.artifactId),
          ]);
        } else if (isUnconfirmedWithdrawArtifactTx(tx)) {
          await Promise.all([
            await gameManager.hardRefreshPlanet(tx.intent.locationId),
            await gameManager.hardRefreshArtifact(tx.intent.artifactId),
          ]);
        } else if (isUnconfirmedProspectPlanetTx(tx)) {
          await gameManager.softRefreshPlanet(tx.intent.planetId);
        } else if (isUnconfirmedActivateArtifactTx(tx)) {
          let refreshFlag = true;
          const fromPlanet = await gameManager.getPlanetWithId(tx.intent.locationId);
          const artifact = await gameManager.getArtifactWithId(tx.intent.artifactId);

          if (artifact?.artifactType === ArtifactType.FireLink) {
            if (fromPlanet && fromPlanet.locationId && tx.intent.linkTo) {
              const toPlanet = await gameManager.getPlanetWithId(tx.intent.linkTo);
              if (toPlanet) {
                const activeArtifactOnToPlanet = await gameManager.getActiveArtifact(toPlanet);
                if (
                  activeArtifactOnToPlanet &&
                  activeArtifactOnToPlanet.artifactType === ArtifactType.IceLink &&
                  activeArtifactOnToPlanet.linkTo
                ) {
                  const toLinkPlanet = await gameManager.getPlanetWithId(
                    activeArtifactOnToPlanet.linkTo
                  );
                  if (toLinkPlanet) {
                    await Promise.all([
                      gameManager.bulkHardRefreshPlanets([
                        fromPlanet.locationId,
                        toPlanet.locationId,
                        toLinkPlanet.locationId,
                      ]),
                      gameManager.hardRefreshArtifact(tx.intent.artifactId),
                    ]);
                    refreshFlag = false;
                  }
                }
              }
            }
          }

          if (refreshFlag) {
            if (tx.intent.linkTo) {
              await Promise.all([
                gameManager.bulkHardRefreshPlanets([tx.intent.locationId, tx.intent.linkTo]),
                gameManager.hardRefreshArtifact(tx.intent.artifactId),
              ]);
            } else {
              await Promise.all([
                gameManager.hardRefreshPlanet(tx.intent.locationId),
                gameManager.hardRefreshArtifact(tx.intent.artifactId),
              ]);
            }
          }
        } else if (isUnconfirmedDeactivateArtifactTx(tx)) {
          // console.log(tx);
          if (tx.intent.linkTo) {
            await Promise.all([
              gameManager.bulkHardRefreshPlanets([tx.intent.locationId, tx.intent.linkTo]),
              gameManager.hardRefreshArtifact(tx.intent.artifactId),
            ]);
          } else {
            await Promise.all([
              gameManager.hardRefreshPlanet(tx.intent.locationId),
              gameManager.hardRefreshArtifact(tx.intent.artifactId),
            ]);
          }
        } else if (isUnconfirmedChangeArtifactImageTypeTx(tx)) {
          await Promise.all([
            await gameManager.hardRefreshPlanet(tx.intent.locationId),
            await gameManager.hardRefreshArtifact(tx.intent.artifactId),
          ]);
        } else if (isUnconfirmedBuyArtifactTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshPlanet(tx.intent.locationId),
            gameManager.hardRefreshArtifact(tx.intent.artifactId),
          ]);
        } else if (isUnconfirmedWithdrawSilverTx(tx)) {
          await gameManager.softRefreshPlanet(tx.intent.locationId);
        } else if (isUnconfirmedCapturePlanetTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshPlayer(gameManager.getAccount()),
            gameManager.hardRefreshPlanet(tx.intent.locationId),
          ]);
        } else if (isUnconfirmedInvadePlanetTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshPlayer(gameManager.getAccount()),
            gameManager.hardRefreshPlanet(tx.intent.locationId),
          ]);
        } else if (isUnconfirmedClaimTx(tx)) {
          gameManager.entityStore.updatePlanet(
            tx.intent.locationId,
            (p) => (p.claimer = gameManager.getAccount())
          );
        } else if (isUnconfirmedCreateUnionTx(tx)) {
          const unions = gameManager.getAllUnions();
          const newUnionId = unions.length + 1;

          await Promise.all([
            gameManager.hardRefreshUnion(newUnionId.toString() as UnionId),
            gameManager.hardRefreshPlayer(gameManager.getAccount()),
          ]);
        } else if (isUnconfirmedInviteMemberTx(tx)) {
          await Promise.all([gameManager.hardRefreshUnion(tx.intent.unionId)]);
        } else if (isUnconfirmedCancelInviteTx(tx)) {
          await Promise.all([gameManager.hardRefreshUnion(tx.intent.unionId)]);
        } else if (isUnconfirmedAcceptInviteTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshUnion(tx.intent.unionId),
            gameManager.hardRefreshPlayer(gameManager.getAccount()),
          ]);
        } else if (isUnconfirmedSendApplicationTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshUnion(tx.intent.unionId),
            gameManager.hardRefreshPlayer(gameManager.getAccount()),
          ]);
        } else if (isUnconfirmedCancelApplicationTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshUnion(tx.intent.unionId),
            gameManager.hardRefreshPlayer(gameManager.getAccount()),
          ]);
        } else if (isUnconfirmedRejectApplicationTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshUnion(tx.intent.unionId),
            gameManager.hardRefreshPlayer(tx.intent.applicant),
          ]);
        } else if (isUnconfirmedAcceptApplicationTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshUnion(tx.intent.unionId),
            gameManager.hardRefreshPlayer(tx.intent.applicant),
          ]);
        } else if (isUnconfirmedLeaveUnionTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshUnion(tx.intent.unionId),
            gameManager.hardRefreshPlayer(gameManager.getAccount()),
          ]);
        } else if (isUnconfirmedKickMemberTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshUnion(tx.intent.unionId),
            gameManager.hardRefreshPlayer(tx.intent.member),
          ]);
        } else if (isUnconfirmedTransferLeaderRoleTx(tx)) {
          await Promise.all([
            gameManager.hardRefreshUnion(tx.intent.unionId),
            gameManager.hardRefreshPlayer(tx.intent.newLeader),
            gameManager.hardRefreshPlayer(gameManager.getAccount()),
          ]);
        } else if (isUnconfirmedChangeUnionNameTx(tx)) {
          await Promise.all([gameManager.hardRefreshUnion(tx.intent.unionId)]);
        } else if (isUnconfirmedDisbandUnionTx(tx)) {
          const group = [];
          const union = gameManager.getUnion(tx.intent.unionId);
          if (union) {
            for (let i = 0; i < union.members.length; i++) {
              group.push(gameManager.hardRefreshPlayer(union.members[i]));
            }
          }
          group.push(gameManager.hardRefreshUnion(tx.intent.unionId));
          await Promise.all(group);
        } else if (isUnconfirmedLevelUpUnionTx(tx)) {
          await Promise.all([gameManager.hardRefreshUnion(tx.intent.unionId)]);
        }

        gameManager.entityStore.clearUnconfirmedTxIntent(tx);
        gameManager.onTxConfirmed(tx);
      })
      .on(ContractsAPIEvent.TxErrored, async (tx: Transaction) => {
        gameManager.entityStore.clearUnconfirmedTxIntent(tx);
        if (tx.hash) {
          gameManager.persistentChunkStore.onEthTxComplete(tx.hash);
        }
        gameManager.onTxReverted(tx);
      })
      .on(ContractsAPIEvent.TxCancelled, async (tx: Transaction) => {
        gameManager.onTxCancelled(tx);
      })
      .on(ContractsAPIEvent.RadiusUpdated, async () => {
        const newRadius = await gameManager.contractsAPI.getWorldRadius();
        gameManager.setRadius(newRadius);
      });

    const unconfirmedTxs = await persistentChunkStore.getUnconfirmedSubmittedEthTxs();
    const confirmationQueue = new ThrottledConcurrentQueue({
      invocationIntervalMs: 1000,
      maxInvocationsPerIntervalMs: 10,
      maxConcurrency: 1,
    });

    for (const unconfirmedTx of unconfirmedTxs) {
      confirmationQueue.add(async () => {
        const tx = gameManager.contractsAPI.txExecutor.waitForTransaction(unconfirmedTx);
        gameManager.contractsAPI.emitTransactionEvents(tx);
        return tx.confirmedPromise;
      });
    }

    // we only want to initialize the mining manager if the player has already joined the game
    // if they haven't, we'll do this once the player has joined the game
    if (!!homeLocation && initialState.players.has(account as string)) {
      gameManager.initMiningManager(homeLocation.coords);
    }

    return gameManager;
  }

  private async hardRefreshUnion(unionId?: UnionId): Promise<void> {
    if (!unionId) return;

    const unionFromBlockchain = await this.contractsAPI.getUnionById(unionId);
    if (!unionFromBlockchain) return;

    this.unions.set(unionId, unionFromBlockchain);
    this.unionsUpdated$.publish();
  }

  private async hardRefreshUnions(): Promise<void> {
    try {
      const unions = await this.getAllUnions(); // Implement getAllUnionIds based on your contract interface
      const updatedUnions: Union[] = [];

      for (const union of unions) {
        const uniontemp = await this.contractsAPI.getUnionById(union.unionId); // Implement getUnionById based on your contract interface
        if (uniontemp) {
          updatedUnions.push(uniontemp);
        }
      }

      // Update local storage of unions (this.unions assuming it's a Map<number, Union>)
      updatedUnions.forEach((union) => {
        this.unions.set(union.unionId, union);
      });

      this.unionsUpdated$.publish(); // Assuming this triggers an update in your UI or state management
    } catch (error) {
      console.error('Error refreshing unions:', error);
      // Handle error as needed, e.g., show error message to user
    }
  }

  /**
   * Get the unionId of the given player.
   */
  public getPlayerUnionId(addr: EthAddress): UnionId | undefined {
    const player = this.players.get(addr);
    if (!player) return undefined;
    return player?.unionId;
  }

  /**
   * Gets a list of all the players in the game (not just the ones you've
   * encounterd)
   */
  public getAllUnions(): Union[] {
    return Array.from(this.unions.values());
  }

  /**
   * Gets either the given union
   */
  public getUnion(unionId?: UnionId): Union | undefined {
    if (!unionId) return undefined;
    // Retrieve the union from the map by its ID
    const union = this.unions.get(unionId);
    return union;
  }

  public getMaxMembers(unionLevel: number) {
    const MEMBERS_PER_LEVEL = 2;
    const BASE_MAX_MEMBERS = 5;
    return BASE_MAX_MEMBERS + unionLevel * MEMBERS_PER_LEVEL;
  }

  /**
   *
   */

  public async addMemberByAdmin(
    unionId: UnionId,
    member: EthAddress
  ): Promise<Transaction<UnconfirmedAddMemberByAdmin>> {
    try {
      if (!this.account) {
        throw new Error('no account set');
      }

      const union = this.getUnion(unionId);
      if (!union) {
        throw new Error('invalid union');
      }

      const player = this.getPlayer(member);
      if (!player) {
        throw new Error("can't find this player");
      }

      if (union.members.length >= this.getMaxMembers(union.level)) {
        throw new Error('union is full');
      }

      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}-addMemberByAdmin-unionId`,
        unionId.toString()
      );
      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}-addMemberByAdmin-member`,
        member.toString()
      );
      const txIntent: UnconfirmedAddMemberByAdmin = {
        methodName: 'addMemberByAdmin',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([unionId, member]),
        unionId: unionId,
        member: member,
      };

      // Always await the submitTransaction so we can catch rejections
      const tx = await this.contractsAPI.submitTransaction(txIntent);
      return tx;
    } catch (e) {
      this.getNotificationsManager().txInitError('addMemberByAdmin', e.message);
      throw e;
    }
  }

  public async createUnion(unionName: string): Promise<Transaction<UnconfirmedCreateUnion>> {
    try {
      if (!this.account) throw new Error('no account');

      const player = this.getPlayer(this.account);
      if (!player) throw new Error('no player');
      if (Number(player.unionId) !== 0) throw new Error('you are already in other union');

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}-createUnion-unionName`, unionName);

      const unionCreationFee = await this.contractsAPI.getUnionCreationFee();

      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}-createUnion-fee`,
        unionCreationFee.toString()
      );

      const txIntent: UnconfirmedCreateUnion = {
        methodName: 'createUnion',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([unionName]),
        name: unionName,
      };

      const tx = await this.submitTransaction(txIntent, {
        value: unionCreationFee.toString(),
      });

      return tx;
    } catch (e) {
      this.getNotificationsManager().txInitError('createUnion', e.message);
      throw e;
    }
  }

  public async inviteMember(
    unionId: UnionId,
    invitee: EthAddress
  ): Promise<Transaction<UnconfirmedInviteMember>> {
    try {
      if (!this.account) throw new Error('no account');

      const invitePlayer = this.getPlayer(invitee);
      if (!invitePlayer) throw Error('invalid invitee');

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      if (union.leader !== this.account) {
        throw Error('not the union leader');
      }

      for (let i = 0; i < union.members.length; i++) {
        if (union.members[i] === invitee) throw Error('already in members list');
      }

      for (let i = 0; i < union.invitees.length; i++) {
        if (union.invitees[i] === invitee) throw Error('already in invitees list');
      }

      for (let i = 0; i < union.applicants.length; i++) {
        if (union.applicants[i] === invitee) throw Error('already in applicants list');
      }

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--inviteMember-unionId`, unionId);
      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--inviteMember-invitee`, invitee);

      const txIntent: UnconfirmedInviteMember = {
        methodName: 'inviteMember',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([union.unionId, invitee]),
        unionId: unionId,
        invitee: invitee,
      };

      return await this.submitTransaction(txIntent);
    } catch (e) {
      this.getNotificationsManager().txInitError('inviteMember', e.message);
      throw e;
    }
  }

  public async cancelInvite(
    unionId: UnionId,
    invitee: EthAddress
  ): Promise<Transaction<UnconfirmedCancelInvite>> {
    try {
      if (!this.account) throw new Error('no account');

      const invitePlayer = this.getPlayer(invitee);
      if (!invitePlayer) throw Error('invalid invitee');

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      if (union.leader !== this.account) {
        throw Error('not the union leader');
      }

      for (let i = 0; i < union.members.length; i++) {
        if (union.members[i] === invitee) throw Error('already in member list');
      }

      let inInviteesList = false;
      for (let i = 0; i < union.invitees.length; i++) {
        if (union.invitees[i] === invitee) {
          inInviteesList = true;
          break;
        }
      }
      if (inInviteesList === false) throw Error('not in invitee list');

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--cancelInvite-unionId`, unionId);
      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--cancelInvite-invitee`, invitee);

      const txIntent: UnconfirmedCancelInvite = {
        methodName: 'cancelInvite',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([union.unionId, invitee]),
        unionId: unionId,
        invitee: invitee,
      };

      const tx = await this.submitTransaction(txIntent);
      return tx;
    } catch (e) {
      this.getNotificationsManager().txInitError('cancelInvite', e.message);
      throw e;
    }
  }

  public async timeUntilNextApplyUnionAvaiable() {
    if (!this.account) {
      throw new Error('no account set');
    }

    const myLastLeaveUnionTimestamp = this.players.get(this.account)?.leaveUnionTimestamp;
    if (!myLastLeaveUnionTimestamp) return 0;
    const cooldown = (await this.contractsAPI.getUnionRejoinCooldown()).toNumber();
    return (myLastLeaveUnionTimestamp + cooldown) * 1000 - Date.now();
  }

  public async getNextApplyUnionAvailableTimestamp() {
    const _ = await this.timeUntilNextApplyUnionAvaiable();
    return Date.now() + _;
  }

  public async acceptInvite(unionId: UnionId): Promise<Transaction<UnconfirmedAcceptInvite>> {
    try {
      if (!this.account) throw new Error('no account');
      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      for (let i = 0; i < union.members.length; i++) {
        if (union.members[i] === this.account) throw Error('already in member list');
      }

      let inInviteesList = false;
      for (let i = 0; i < union.invitees.length; i++) {
        if (union.invitees[i] === this.account) {
          inInviteesList = true;
          break;
        }
      }
      if (inInviteesList === false) throw Error('not in invitee list');

      if (union.members.length >= this.getMaxMembers(union.level)) {
        throw new Error('union is full');
      }

      const myLastLeaveUnionTimestamp = this.players.get(this.account)?.leaveUnionTimestamp;
      const nextApplyUnionAvailableTimestamp = await this.getNextApplyUnionAvailableTimestamp();
      if (myLastLeaveUnionTimestamp && Date.now() < nextApplyUnionAvailableTimestamp) {
        throw new Error('still in cooldown time');
      }

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--acceptInvite-unionId`, unionId);

      const txIntent: UnconfirmedAcceptInvite = {
        methodName: 'acceptInvite',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([unionId]),
        unionId: unionId,
      };

      return await this.submitTransaction(txIntent);
    } catch (e) {
      this.getNotificationsManager().txInitError('acceptInvite', e.message);
      throw e;
    }
  }

  public async sendApplication(unionId: UnionId): Promise<Transaction<UnconfirmedSendApplication>> {
    try {
      if (!this.account) throw new Error('no account');
      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      let isInvitee = false;
      for (let i = 0; i < union.invitees.length; i++)
        if (union.invitees[i] === this.account) isInvitee = true;
      if (isInvitee) throw Error('can acceptInvite');

      let isApplicant = false;
      for (let i = 0; i < union.applicants.length; i++)
        if (union.applicants[i] === this.account) isApplicant = true;
      if (isApplicant) throw Error('already in applicant list');

      let isMember = false;
      for (let i = 0; i < union.members.length; i++)
        if (union.members[i] === this.account) isMember = true;
      if (isMember) throw Error('already in this union');

      if (union.members.length >= this.getMaxMembers(union.level)) {
        throw new Error('union is full');
      }

      const myLastLeaveUnionTimestamp = this.players.get(this.account)?.leaveUnionTimestamp;
      const nextApplyUnionAvailableTimestamp = await this.getNextApplyUnionAvailableTimestamp();

      if (myLastLeaveUnionTimestamp && Date.now() < nextApplyUnionAvailableTimestamp) {
        throw new Error('still in cooldown time');
      }

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--sendApplication-unionId`, unionId);

      const txIntent: UnconfirmedSendApplication = {
        methodName: 'sendApplication',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([unionId]),
        unionId: unionId,
      };

      const tx = await this.submitTransaction(txIntent);
      return tx;
    } catch (e) {
      this.getNotificationsManager().txInitError('sendApplication', e.message);
      throw e;
    }
  }

  public async cancelApplication(
    unionId: UnionId
  ): Promise<Transaction<UnconfirmedCancelApplication>> {
    try {
      if (!this.account) throw new Error('no account');
      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      let isApplicant = false;
      for (let i = 0; i < union.applicants.length; i++)
        if (union.applicants[i] === this.account) isApplicant = true;
      if (!isApplicant) throw Error('not in applicant list');

      let isMember = false;
      for (let i = 0; i < union.members.length; i++)
        if (union.members[i] === this.account) isMember = true;
      if (isMember) throw Error('already in this union');

      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}--cancelApplication-unionId`,
        unionId
      );

      const txIntent: UnconfirmedCancelApplication = {
        methodName: 'cancelApplication',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([unionId]),
        unionId: unionId,
      };

      const tx = await this.submitTransaction(txIntent);
      return tx;
    } catch (e) {
      this.getNotificationsManager().txInitError('cancelApplication', e.message);
      throw e;
    }
  }

  public async rejectApplication(
    unionId: UnionId,
    applicant: EthAddress
  ): Promise<Transaction<UnconfirmedRejectApplication>> {
    try {
      if (!this.account) throw new Error('no account');
      const applicantPlayer = this.getPlayer(applicant);
      if (!applicantPlayer) throw 'invalid applicant';

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');
      if (union.leader !== this.account) throw Error('not the union leader');

      let isMember = false;
      for (let i = 0; i < union.members.length; i++)
        if (union.members[i] === applicant) isMember = true;
      if (isMember) throw Error('already in this union');

      let isApplicant = false;
      for (let i = 0; i < union.applicants.length; i++)
        if (union.applicants[i] === applicant) isApplicant = true;
      if (!isApplicant) throw Error('not in applicant list');

      let isInvitee = false;
      for (let i = 0; i < union.invitees.length; i++)
        if (union.invitees[i] === applicant) isInvitee = true;
      if (isInvitee) throw Error('can acceptInvite');

      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}--rejectApplication-unionId`,
        unionId
      );

      const txIntent: UnconfirmedRejectApplication = {
        methodName: 'rejectApplication',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([unionId, applicant]),
        unionId: unionId,
        applicant: applicant,
      };

      const tx = await this.submitTransaction(txIntent);
      return tx;
    } catch (e) {
      this.getNotificationsManager().txInitError('rejectApplication', e.message);
      throw e;
    }
  }

  public async acceptApplication(
    unionId: UnionId,
    applicant: EthAddress
  ): Promise<Transaction<UnconfirmedAcceptApplication>> {
    try {
      if (!this.account) throw new Error('no account');
      const applicantPlayer = this.getPlayer(applicant);
      if (!applicantPlayer) throw 'invalid applicant';

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');
      if (union.leader !== this.account) throw Error('not the union leader');

      let isMember = false;
      for (let i = 0; i < union.members.length; i++)
        if (union.members[i] === applicant) isMember = true;
      if (isMember) throw Error('already in this union');

      let isApplicant = false;
      for (let i = 0; i < union.applicants.length; i++)
        if (union.applicants[i] === applicant) isApplicant = true;
      if (!isApplicant) throw Error('not in applicant list');

      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}--acceptApplication-unionId`,
        unionId
      );

      const txIntent: UnconfirmedAcceptApplication = {
        methodName: 'acceptApplication',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([unionId, applicant]),
        unionId: unionId,
        applicant: applicant,
      };

      const tx = await this.submitTransaction(txIntent);
      return tx;
    } catch (e) {
      this.getNotificationsManager().txInitError('acceptApplication', e.message);
      throw e;
    }
  }

  public async leaveUnion(unionId: UnionId): Promise<Transaction<UnconfirmedLeaveUnion>> {
    try {
      if (!this.account) throw new Error('no account');
      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');
      if (union.leader === this.account) throw Error('leader cannot leave the union');

      let inMemberList = false;
      for (let i = 0; i < union.members.length; i++) {
        if (union.members[i] === this.account) inMemberList = true;
      }
      if (inMemberList === false) throw Error('not in union');

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--leaveUnion-unionId`, unionId);

      const txIntent: UnconfirmedLeaveUnion = {
        methodName: 'leaveUnion',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([unionId]),
        unionId: unionId,
      };

      return await this.submitTransaction(txIntent);
    } catch (e) {
      this.getNotificationsManager().txInitError('leaveUnion', e.message);
      throw e;
    }
  }

  public async kickMember(
    unionId: UnionId,
    member: EthAddress
  ): Promise<Transaction<UnconfirmedKickMember>> {
    try {
      if (!this.account) throw new Error('no account');

      const memberState = this.getPlayer(member);
      if (!memberState) throw new Error('invalid member');

      if (member === this.account) {
        throw new Error('cannot kick yourself');
      }

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      if (union.leader !== this.account) {
        throw Error('not the union leader');
      }

      let inMemberList = false;
      for (let i = 0; i <= union.members.length; i++) {
        if (union.members[i] === member) {
          inMemberList = true;
        }
      }
      if (inMemberList === false) throw Error('not in member list');

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--kickMember-unionId`, unionId);
      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--kickMember-member`, member);

      const txIntent: UnconfirmedKickMember = {
        methodName: 'kickMember',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([union.unionId, member]),
        unionId: unionId,
        member: member,
      };

      return await this.submitTransaction(txIntent);
    } catch (e) {
      this.getNotificationsManager().txInitError('kickMember', e.message);
      throw e;
    }
  }

  public async transferLeaderRole(
    unionId: UnionId,
    newLeader: EthAddress
  ): Promise<Transaction<UnconfirmedTransferLeaderRole>> {
    try {
      if (!this.account) throw new Error('no account');

      if (newLeader === this.account) {
        throw new Error('cannot transfer leader role to yourself');
      }

      const newLeaderState = this.getPlayer(newLeader);
      if (!newLeaderState) throw new Error('invalid new leader');

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      if (union.leader !== this.account) {
        throw Error('not the union leader');
      }

      let inMemberList = false;
      for (let i = 0; i < union.members.length; i++) {
        if (union.members[i] === newLeader) {
          inMemberList = true;
        }
      }
      if (inMemberList === false) throw Error('not in member list');

      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}--transferLeaderRole-unionId`,
        unionId
      );
      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}--transferLeaderRole-newLeader`,
        newLeader
      );

      const txIntent: UnconfirmedTransferLeaderRole = {
        methodName: 'transferLeaderRole',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([union.unionId, newLeader]),
        unionId: unionId,
        newLeader: newLeader,
      };

      return await this.submitTransaction(txIntent);
    } catch (e) {
      this.getNotificationsManager().txInitError('transferLeaderRole', e.message);
      throw e;
    }
  }

  public async changeUnionName(
    unionId: UnionId,
    name: string
  ): Promise<Transaction<UnconfirmedChangeUnionName>> {
    try {
      if (!this.account) throw new Error('no account');

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');

      console.log(union.unionId);
      console.log(unionId);
      if (union.unionId !== unionId) throw Error('union is disbanded');

      if (union.leader !== this.account) {
        throw Error('not the union leader');
      }

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--changeUnionName-unionId`, unionId);

      const txIntent: UnconfirmedChangeUnionName = {
        methodName: 'changeUnionName',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([union.unionId, name]),
        unionId: unionId,
        newName: name,
      };

      return await this.submitTransaction(txIntent);
    } catch (e) {
      this.getNotificationsManager().txInitError('changeUnionName', e.message);
      throw e;
    }
  }

  public async disbandUnion(unionId: UnionId): Promise<Transaction<UnconfirmedDisbandUnion>> {
    try {
      if (!this.account) throw new Error('no account');

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      if (union.leader !== this.account) {
        throw Error('not the union leader');
      }

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--disbandUnion-unionId`, unionId);

      const txIntent: UnconfirmedDisbandUnion = {
        methodName: 'disbandUnion',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([union.unionId]),
        unionId: unionId,
      };

      return await this.submitTransaction(txIntent);
    } catch (e) {
      this.getNotificationsManager().txInitError('disbandUnion', e.message);
      throw e;
    }
  }

  public async levelUpUnion(unionId: UnionId): Promise<Transaction<UnconfirmedLevelUpUnion>> {
    try {
      if (!this.account) throw new Error('no account');

      const union = this.getUnion(unionId);
      if (!union) throw Error('no union');
      if (union.unionId !== unionId) throw Error('union is disbanded');

      if (union.leader !== this.account) {
        throw Error('not the union leader');
      }

      if (union.level === 3) {
        throw Error('can not level up');
      }

      localStorage.setItem(`${this.getAccount()?.toLowerCase()}--levelUpUnion-unionId`, unionId);

      const levelUpUnionFee = await this.contractsAPI.getLevelUpUnionFee(union.level + 1);

      localStorage.setItem(
        `${this.getAccount()?.toLowerCase()}-levelUpUnion-fee`,
        levelUpUnionFee.toString()
      );

      const txIntent: UnconfirmedLevelUpUnion = {
        methodName: 'levelUpUnion',
        contract: this.contractsAPI.contract,
        args: Promise.resolve([union.unionId]),
        unionId: unionId,
      };

      const tx = await this.submitTransaction(txIntent, {
        value: levelUpUnionFee.toString(),
      });
      return tx;
    } catch (e) {
      this.getNotificationsManager().txInitError('levelUpUnion', e.message);
      throw e;
    }
  }
}

export default Round4GameManager;
