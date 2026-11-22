import { useRef } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles/Table.css';
import '@mantine/core/styles/global.css';

const inventoryTrialTheme = createTheme({
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  headings: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  primaryColor: 'slate',
  primaryShade: 9,
  defaultRadius: 8,
  colors: {
    slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'],
  },
});

/** Ignores storage. forceColorScheme already locks light mode. */
const lightOnlyColorSchemeManager = {
  get: () => 'light',
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};

export default function MantinePilot({ children }) {
  const rootRef = useRef(null);
  return (
    <div className="mantine-pilot" ref={rootRef}>
      <MantineProvider
        theme={inventoryTrialTheme}
        forceColorScheme="light"
        defaultColorScheme="light"
        colorSchemeManager={lightOnlyColorSchemeManager}
        cssVariablesSelector=".mantine-pilot"
        getRootElement={() => rootRef.current || undefined}
        withGlobalClasses={false}
      >
        {children}
      </MantineProvider>
    </div>
  );
}
