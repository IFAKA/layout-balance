# Research notes

- Weight maps: each object gets a visual weight; the balance is the centre of weight against the centre of the layout. Columbia, [Evaluation of Visual Balance for Automated Layout](http://www.cs.columbia.edu/~lok/papers/balance.pdf).
- Visual Moment Equilibrium: balance as a force field, handles asymmetric layouts. [Symmetry 2025](https://doi.org/10.3390/sym18010041).
- Poster metrics: centre of visual weight as a weighted average of text-box positions. [arXiv 2402.06945](https://arxiv.org/pdf/2402.06945).
- Layout checkers (overflow, overlap, clipped text, tap targets): [OverflowLint](https://overflowlint.pmil.me/), [UICheck](https://uicheck.app/), [OverlayQA](https://overlayqa.com/workflows/automated-design-review/).
- Limit: learned aesthetic scorers generalise poorly across page types, so layout-balance uses fixed, explainable rules.

Thresholds here are starting points set by hand on one landing page, not research results. Tune them in `balance.config.json`.
