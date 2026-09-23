// Shared placeholder layout used by every screen until its real UI is
// built in a later task. Keeps a consistent header/description pattern
// so each page file only needs to supply its own title and description.

/**
 * Renders a placeholder page section with a title and description.
 * @param {{ title: string, description: string, children?: import('react').ReactNode }} props
 * @returns {JSX.Element}
 */
function PageShell({ title, description, children }) {
  return (
    <section className="page-shell">
      <h1>{title}</h1>
      <p className="page-shell__description">{description}</p>
      {children}
    </section>
  );
}

export default PageShell;
