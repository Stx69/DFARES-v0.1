import { PICTURE_URL } from '@darkforest_eth/constants';
import { AvatarType } from '@darkforest_eth/types';

export type Avatar = {
  legacy: boolean;
  topLayer: Array<string>;
  bottomLayer: Array<string>;
  // image?: () => Promise<HTMLImageElement>;
};

const URL = PICTURE_URL;

const Jasonlool = {
  legacy: false,
  topLayer: [URL + '/img/avatar/Jasonlool.png'],
  bottomLayer: [],
  // image: () =>
  //   new Promise<HTMLImageElement>((resolve) => {
  //     const img = new Image();
  //     img.src = 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=025';
  //     img.onload = () => resolve(img);
  //   }),
};

const Santagnel = {
  legacy: false,
  topLayer: [URL + '/img/logo/Santagnel.png'],
  bottomLayer: [],
};

const OriginTiger = {
  legacy: false,
  topLayer: [URL + '/img/logo/OriginTiger.png'],
  bottomLayer: [],
};

const zeroxviviyorg = {
  legacy: false,
  topLayer: [URL + '/img/logo/zeroxviviyorg.png'],
  bottomLayer: [],
};

const ikun = {
  legacy: false,
  topLayer: [URL + '/img/logo/ikun.png'],
  bottomLayer: [],
};

const BaliGee = {
  legacy: false,
  topLayer: [URL + '/img/logo/BaliGee.png'],
  bottomLayer: [],
};

const DDY = {
  legacy: false,
  topLayer: [URL + '/img/logo/ddy.png'],
  bottomLayer: [],
};

const Blue = {
  legacy: false,
  topLayer: [URL + '/img/logo/Blue.png'],
  bottomLayer: [],
};

export const avatarFromType = (type: AvatarType): Avatar => avatars[type];

export const avatars: Record<AvatarType, Avatar> = {
  [AvatarType.Jasonlool]: Jasonlool,
  [AvatarType.Santagnel]: Santagnel,
  [AvatarType.OriginTiger]: OriginTiger,
  [AvatarType.Zeroxviviyorg]: zeroxviviyorg,
  [AvatarType.Ikun]: ikun,
  [AvatarType.BaliGee]: BaliGee,
  [AvatarType.DDY]: DDY,
  [AvatarType.Blue]: Blue,
};
