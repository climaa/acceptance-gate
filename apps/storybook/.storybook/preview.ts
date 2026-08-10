import type { Preview } from '@storybook/nextjs-vite';

// The design system's tokens, faces and component rules — the same stylesheet the
// blog's root layout imports, so a story is rendered by the shipping CSS rather
// than by a copy of it. Imported here and nowhere else in this app.
import '@gate/ui/styles.css';

const preview: Preview = {
  // Every story gets a generated docs page — project-wide, so adding a
  // component never means also remembering to tag its story. Nothing in
  // packages/ui carries this tag itself.
  tags: ['autodocs'],
};

export default preview;
