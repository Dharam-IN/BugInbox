/** Inline stroke icons. Nothing is fetched; nothing reaches the widget bundle. */
function Icon({ paths, size = 17 }: { paths: string[]; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const OverviewIcon = () => <Icon paths={['M4 13h5v7H4z', 'M15 4h5v16h-5z', 'M4 4h5v5H4z']} />;
export const ProjectsIcon = () => <Icon paths={['M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z']} />;
export const ReportsIcon = () => (
  <Icon paths={['M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15l-3.5-2.2-3.5 2.2-3.5-2.2L5 19.5Z', 'M9 8h6', 'M9 12h4']} />
);
export const SettingsIcon = () => (
  <Icon paths={['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z', 'M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06A2 2 0 1 1 4.4 16.9l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06A2 2 0 1 1 7.1 4.4l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z']} />
);
export const InstallIcon = () => <Icon paths={['M9 7 4 12l5 5', 'm15 7 5 5-5 5']} />;
export const MenuIcon = () => <Icon paths={['M4 7h16', 'M4 12h16', 'M4 17h16']} size={19} />;
export const CloseIcon = () => <Icon paths={['M6 6l12 12', 'M18 6 6 18']} size={19} />;
export const PlusIcon = () => <Icon paths={['M12 5v14', 'M5 12h14']} size={16} />;
export const BackIcon = () => <Icon paths={['M15 6l-6 6 6 6']} size={16} />;
export const SearchIcon = () => <Icon paths={['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-3.5-3.5']} size={15} />;
export const ImageIcon = () => (
  <Icon paths={['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z', 'm4 16 4.5-4 4 3.5 3-2.5L20 17']} size={13} />
);
export const InboxIcon = () => (
  <Icon paths={['M4 13h4l1.5 3h5L16 13h4', 'M4 13 6.5 5h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z']} size={20} />
);
export const CheckIcon = () => <Icon paths={['m5 12.5 4.5 4.5L19 7']} size={15} />;
export const ExternalIcon = () => <Icon paths={['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5']} size={13} />;
