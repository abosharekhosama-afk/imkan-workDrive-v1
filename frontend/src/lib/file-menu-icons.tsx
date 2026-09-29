import { Icons } from "../components/layout/icons";

const sz = 16;

/** Icons for Zoho WorkDrive row / selection action menus. */
export const FileMenuIcons = {
  openNewTab: <Icons.openExt size={sz} />,
  properties: <Icons.props size={sz} />,
  shareMenu: <Icons.share size={sz} />,
  addMembers: <Icons.users size={sz} />,
  externalShareLink: <Icons.link size={sz} />,
  downloadLink: <Icons.download size={sz} />,
  embedCode: <Icons.code size={sz} />,
  shareToSupport: <Icons.headset size={sz} />,
  copyPermalink: <Icons.link size={sz} />,
  moveTo: <Icons.upload size={sz} className="rotate-180" />,
  copyTo: <Icons.copy size={sz} />,
  assignWorkflow: <Icons.flow size={sz} />,
  organize: <Icons.tag size={sz} />,
  associateDataTemplate: <Icons.props size={sz} />,
  searchInFold: <Icons.search size={sz} />,
  download: <Icons.download size={sz} />,
  rename: <Icons.pencil size={sz} />,
  followUpdates: <Icons.bell size={sz} />,
  unfollowUpdates: <Icons.bell size={sz} />,
  moreOptions: <Icons.dots size={sz} />,
  moveToTrash: <Icons.trash size={sz} />,
  newFolder: <Icons.folder size={sz} />,
  writer: <Icons.doc size={sz} />,
  sheet: <Icons.sheet size={sz} />,
  show: <Icons.slide size={sz} />,
  uploadFiles: <Icons.upload size={sz} />,
  uploadFolder: <Icons.folder size={sz} />,
  importCloud: <Icons.cloudUp size={sz} />,
  screenRecord: <Icons.camera size={sz} />,
  videoRecord: <Icons.video size={sz} />,
  audioRecord: <Icons.mic size={sz} />,
  preview: <Icons.eye size={sz} />,
  versionHistory: <Icons.history size={sz} />,
  favorite: <Icons.star size={sz} />,
  unfavorite: <Icons.star size={sz} className="fill-current" />,
} as const;

export type FileMenuIconKey = keyof typeof FileMenuIcons;
