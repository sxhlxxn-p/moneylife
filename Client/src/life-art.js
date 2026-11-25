// One small pixel character shared by the village, profile, and walking frames.
const LifeArt = (() => {
  function character(frame = 0) {
    const stride = Math.round(Math.sin((frame / 8) * Math.PI * 2) * 1.5);
    const ink = "#344354",
      hair = "#424753",
      skin = "#d8b59b";
    return [
      [5, 1, 6, 2, hair],
      [4, 3, 8, 5, hair],
      [5, 4, 6, 6, skin],
      [4, 4, 2, 4, hair],
      [10, 4, 2, 2, hair],
      [6, 6, 1, 1, ink],
      [9, 6, 1, 1, ink],
      [7, 9, 2, 1, "#b58d78"],
      [7, 10, 2, 2, skin],
      [4, 12, 8, 6, "#617b99"],
      [6, 12, 4, 6, "#e4eaf0"],
      [6, 12, 1, 1, "#b3c2d2"],
      [9, 12, 1, 1, "#b3c2d2"],
      [3, 13 + stride, 2, 5, "#617b99"],
      [11, 13 - stride, 2, 5, "#617b99"],
      [3, 18 + stride, 2, 2, skin],
      [11, 18 - stride, 2, 2, skin],
      [5, 18, 6, 1, ink],
      [5 + stride, 19, 3, 3, "#45586d"],
      [9 - stride, 19, 3, 3, "#45586d"],
      [4 + stride, 22, 4, 2, "#2c3543"],
      [9 - stride, 22, 4, 2, "#2c3543"],
    ];
  }
  function avatar() {
    return (
      '<svg viewBox="0 0 16 25" aria-hidden="true" shape-rendering="crispEdges">' +
      character()
        .map(
          ([x, y, w, h, color]) =>
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`,
        )
        .join("") +
      "</svg>"
    );
  }
  function mountAvatar(node) {
    if (!node.querySelector("svg")) node.innerHTML = avatar();
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", "플레이어 프로필");
  }
  return { character, avatar, mountAvatar };
})();
