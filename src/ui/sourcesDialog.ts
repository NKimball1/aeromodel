/**
 * Small "Sources" window listing the published data the model is built on
 * and tested against. Native <dialog>: Escape and the close button dismiss
 * it, and a click on the backdrop closes it too.
 */
import { REFERENCES, UNVALIDATED_NOTE } from '../physics';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export class SourcesDialog {
  private readonly dialog = el('dialog', 'sources');

  constructor(container: HTMLElement) {
    this.dialog.setAttribute('aria-labelledby', 'sources-title');

    const header = el('div', 'sources-header');
    const title = el('h2', 'sources-title', 'Sources & validation');
    title.id = 'sources-title';
    const close = el('button', 'sources-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close sources');
    close.addEventListener('click', () => this.dialog.close());
    header.append(title, close);

    const intro = el(
      'p',
      'sources-intro',
      'The power equation reproduces SRM-measured road rides to within a few watts, and position, tire and drivetrain values are tested against the studies below.',
    );

    const list = el('ol', 'sources-list');
    for (const ref of REFERENCES) {
      const li = el('li');
      const link = el('a', 'sources-link', ref.title);
      link.href = ref.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const meta = el('div', 'sources-meta', `${ref.authors}${ref.year ? ` (${ref.year})` : ''}. ${ref.venue}.`);
      const used = el('div', 'sources-used', ref.usedFor);
      li.append(link, meta, used);
      list.appendChild(li);
    }

    const caveat = el('p', 'sources-caveat', UNVALIDATED_NOTE);

    this.dialog.append(header, intro, list, caveat);
    // Clicks on the backdrop land on the dialog element itself.
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });
    container.appendChild(this.dialog);
  }

  open(): void {
    if (!this.dialog.open) this.dialog.showModal();
  }
}
