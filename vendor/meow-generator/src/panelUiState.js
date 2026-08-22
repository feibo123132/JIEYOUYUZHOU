function applySectionCollapsed(section, collapsed) {
  section.root.classList.toggle('collapsed', collapsed);
  section.heading.setAttribute('aria-expanded', String(!collapsed));
}

export function setExclusiveSectionCollapsed(sections, target, collapsed) {
  for (const section of sections) {
    if (section === target) applySectionCollapsed(section, collapsed);
    else if (!collapsed) applySectionCollapsed(section, true);
  }
}

export function setParameterPanelHidden({ app, panel, button, label }, hidden, labels) {
  app.classList.toggle('parameter-panel-hidden', hidden);
  panel.setAttribute('aria-hidden', String(hidden));
  button.setAttribute('aria-expanded', String(!hidden));
  button.setAttribute('aria-label', hidden ? labels.showAria : labels.hideAria);
  label.textContent = hidden ? labels.show : labels.hide;
}
