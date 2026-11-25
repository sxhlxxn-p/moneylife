// Presentation-only Phaser scene. Money and event rules live in JourneyStore/Engine.
const LifeAnimation = (() => {
  let game, currentScene, observer, pendingFrame;
  let model = { phase: "start", month: 0, moving: false };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const names = {
    street: "나의 일상",
    housing: "새로운 집 앞에서",
    home: "나만의 작은 집",
    park: "잠깐 쉬어가는 공원",
    office: "나의 일터",
    beach: "꿈꿔왔던 바다",
    classroom: "새로운 배움",
    sunset: "내가 살아온 시간",
  };
  function locationFor(state) {
    if (state.phase === "end") return "sunset";
    if (state.phase === "home")
      return state.month === 12 ? "housing" : state.home ? "home" : "street";
    if (state.phase === "rest")
      return state.month === 30 || state.rest ? "park" : "office";
    if (state.phase === "work") return "office";
    if (state.phase === "travel")
      return state.month === 72 || state.travel ? "beach" : "street";
    if (state.phase === "learn")
      return state.month === 96 || state.learn ? "classroom" : "office";
    return "street";
  }
  function ensure() {
    if (game || !window.Phaser) return;
    const host = document.getElementById("life-animation");
    if (!host?.clientWidth || !host.clientHeight) return;
    class LifeScene extends Phaser.Scene {
      constructor() {
        super("life-presentation");
        this.walkDistance = 0;
        this.frameCount = 0;
        this.clouds = [];
      }
      create() {
        this.makeCharacter();
        this.actorShadow = this.add.graphics().setDepth(7);
        this.actor = this.add
          .sprite(0, 0, "life-walking", 0)
          .setOrigin(0.5, 1)
          .setDepth(8);
        this.scale.on("resize", () => this.build());
        this.build();
        this.applyState(model);
        currentScene = this;
        host.dataset.ready = "true";
      }
      rect(g, x, y, w, h, color) {
        g.fillStyle(color, 1);
        g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      }
      makeCharacter() {
        const texture = this.textures.createCanvas("life-walking", 80 * 8, 96);
        const ctx = texture.context;
        ctx.imageSmoothingEnabled = false;
        for (let frame = 0; frame < 8; frame++) {
          const x = frame * 80;
          for (const [px, py, width, height, color] of LifeArt.character(
            frame,
          )) {
            ctx.fillStyle = color;
            ctx.fillRect(x + 16 + px * 3, 12 + py * 3, width * 3, height * 3);
          }
          texture.add(frame, 0, x, 0, 80, 96);
        }
        texture.refresh();
        this.anims.create({
          key: "life-walk",
          frames: this.anims.generateFrameNumbers("life-walking", {
            start: 0,
            end: 7,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }
      pixelTexture(graphics, key, width, height) {
        graphics.generateTexture(key, width, height);
        const texture = this.textures.get(key);
        const source = texture.getSourceImage();
        const small = document.createElement("canvas");
        small.width = Math.ceil(width / 3);
        small.height = Math.ceil(height / 3);
        const reduced = small.getContext("2d");
        reduced.imageSmoothingEnabled = false;
        reduced.drawImage(source, 0, 0, small.width, small.height);
        const context = source.getContext("2d");
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = false;
        context.drawImage(small, 0, 0, width, height);
        texture.refresh();
      }
      cloud(x, y, size) {
        const g = this.add.graphics();
        g.fillStyle(0xfffdf0, 0.92);
        g.fillRect(-34 * size, -8 * size, 85 * size, 19 * size);
        g.fillRect(-15 * size, -22 * size, 34 * size, 18 * size);
        g.fillRect(15 * size, -15 * size, 26 * size, 11 * size);
        g.setPosition(x, y).setDepth(1);
        this.clouds.push({ object: g, speed: 6 + size * 5 });
        this.background.add(g);
      }
      tree(g, x, floor, size = 1, colors = [0x68977b, 0x86af85, 0x7ba67f]) {
        this.rect(
          g,
          x - 5 * size,
          floor - 53 * size,
          10 * size,
          53 * size,
          0x967c5e,
        );
        this.rect(
          g,
          x - 34 * size,
          floor - 104 * size,
          68 * size,
          57 * size,
          colors[0],
        );
        this.rect(
          g,
          x - 24 * size,
          floor - 123 * size,
          48 * size,
          24 * size,
          colors[1],
        );
        this.rect(
          g,
          x - 43 * size,
          floor - 82 * size,
          20 * size,
          28 * size,
          colors[2],
        );
      }
      flowers(g, x, floor, width = 84) {
        const colors = [0x9cae9f, 0xc2c8aa, 0xa4b9c7];
        for (let i = 0; i < Math.floor(width / 22); i++) {
          const px = x + 10 + i * 22,
            top = floor - 26 - (i % 3) * 5;
          this.rect(g, px, top + 4, 3, floor - 10 - top, 0x779977);
          this.rect(g, px - 4, top, 11, 7, colors[i % colors.length]);
          this.rect(g, px - 1, top - 3, 5, 13, colors[i % colors.length]);
          this.rect(g, px, top + 2, 3, 3, 0xffe8ae);
        }
        this.rect(g, x - 3, floor - 13, width + 6, 13, 0xc0957e);
        this.rect(g, x - 6, floor - 17, width + 12, 5, 0xd6ae91);
      }
      lamp(g, x, floor) {
        this.rect(g, x - 4, floor - 146, 8, 146, 0x6a837f);
        this.rect(g, x - 12, floor - 7, 24, 7, 0x59746f);
        this.rect(g, x - 19, floor - 151, 38, 6, 0x59746f);
        this.rect(g, x - 13, floor - 145, 26, 27, 0xf7dfac);
        this.rect(g, x - 16, floor - 118, 32, 5, 0x78938a);
        this.rect(g, x - 2, floor - 145, 4, 27, 0xbdc0a2);
      }
      bookshelf(g, x, floor, width = 74) {
        this.rect(g, x, floor - 136, width, 136, 0xac8c6b);
        this.rect(g, x + 6, floor - 130, width - 12, 130, 0xd7c4a3);
        const colors = [0x87aaa3, 0xd7a087, 0xe6c48c, 0x9daec2, 0xbca4b7];
        for (let row = 0; row < 3; row++) {
          const shelf = floor - 90 + row * 40;
          for (let i = 0; i < 5; i++) {
            const bookHeight = 22 + ((i + row) % 3) * 5;
            const bx = x + 9 + (i * (width - 18)) / 5;
            this.rect(
              g,
              bx,
              shelf - bookHeight,
              (width - 22) / 5,
              bookHeight,
              colors[(i + row) % colors.length],
            );
            this.rect(g, bx + 2, shelf - bookHeight + 4, 3, 2, 0xf5e7c9);
          }
          this.rect(g, x + 3, shelf, width - 6, 6, 0xb39675);
        }
      }
      wallArt(g, x, y, width = 62) {
        this.rect(g, x, y, width, 54, 0xb4997b);
        this.rect(g, x + 5, y + 5, width - 10, 44, 0xf5ecd6);
        this.rect(g, x + 9, y + 9, width - 18, 36, 0xbad3d2);
        this.rect(g, x + width - 26, y + 13, 10, 10, 0xf4d38e);
        this.rect(g, x + 9, y + 33, width - 18, 12, 0x8eaf91);
        this.rect(g, x + 18, y + 27, width - 36, 8, 0xaac2a0);
      }
      bicycle(g, x, floor) {
        g.lineStyle(3, 0x637e7a);
        g.strokeCircle(x, floor - 15, 13);
        g.strokeCircle(x + 48, floor - 15, 13);
        g.lineStyle(3, 0xc58e79);
        g.lineBetween(x, floor - 15, x + 16, floor - 38);
        g.lineBetween(x + 16, floor - 38, x + 28, floor - 15);
        g.lineBetween(x + 28, floor - 15, x, floor - 15);
        g.lineBetween(x + 28, floor - 15, x + 39, floor - 38);
        g.lineBetween(x + 39, floor - 38, x + 48, floor - 15);
        g.lineBetween(x + 16, floor - 38, x + 39, floor - 38);
        this.rect(g, x + 9, floor - 43, 16, 5, 0x59736f);
        this.rect(g, x + 36, floor - 47, 4, 10, 0x59736f);
        this.rect(g, x + 36, floor - 48, 13, 4, 0x59736f);
      }
      cafe(g, x, floor, width) {
        this.rect(g, x, floor - 112, width, 112, 0xb8c9d3);
        this.rect(g, x + 11, floor - 69, width - 22, 69, 0x8da6b6);
        this.rect(g, x + width * 0.62, floor - 68, 6, 68, 0xe7ebef);
        this.rect(g, x + 16, floor - 101, width - 32, 24, 0xe7ebef);
        this.rect(g, x + width / 2 - 9, floor - 96, 15, 13, 0xa87e60);
        g.lineStyle(3, 0xa87e60);
        g.strokeRect(x + width / 2 + 6, floor - 94, 6, 8);
        for (let i = 0; i < width + 10; i += 14)
          this.rect(
            g,
            x - 5 + i,
            floor - 77,
            Math.min(14, width + 10 - i),
            16,
            (i / 14) % 2 ? 0xe7ebef : 0x7d95aa,
          );
        this.rect(g, x - 5, floor - 63, width + 10, 5, 0x6c8398);
      }
      decorate(g, location, w, f) {
        const period = w + 280;
        if (["street", "housing", "sunset"].includes(location)) {
          const front = w * 0.62;
          this.lamp(g, front - 30, f);
          this.flowers(g, 12, f, 74);
          this.bicycle(g, front + 85, f);
          this.rect(g, 134, f - 44, 65, 7, 0xb59a78);
          this.rect(g, 134, f - 31, 65, 7, 0xb59a78);
          this.rect(g, 137, f - 17, 61, 6, 0xc7ad87);
          this.rect(g, 141, f - 11, 5, 11, 0x7b8d7b);
          this.rect(g, 186, f - 11, 5, 11, 0x7b8d7b);
          this.rect(g, front + 267, f - 64, 29, 49, 0xc78f80);
          this.rect(g, front + 263, f - 66, 37, 9, 0xd6a18b);
          this.rect(g, front + 273, f - 53, 17, 4, 0xf5dec0);
          this.rect(g, front + 276, f - 15, 6, 15, 0x829580);
          const shopX = front + 335,
            shopWidth = Math.min(140, period - shopX - 18);
          if (shopWidth >= 90) this.cafe(g, shopX, f, shopWidth);
          if (w > 650) {
            this.cafe(g, front - 235, f, 132);
            this.flowers(g, front - 110, f, 60);
          }
          if (location === "sunset")
            this.tree(g, period - 55, f, 0.65, [0xc39d78, 0xd8b28a, 0xcfa584]);
        } else if (location === "home") {
          this.bookshelf(g, 45, f, 78);
          this.wallArt(g, w * 0.64 - 126, 93, 67);
          this.rect(g, w * 0.64 + 5, f - 28, 93, 8, 0xc2a17b);
          this.rect(g, w * 0.64 + 15, f - 20, 5, 20, 0xa48c6d);
          this.rect(g, w * 0.64 + 80, f - 20, 5, 20, 0xa48c6d);
          this.rect(g, w * 0.64 + 27, f - 37, 22, 8, 0x9cb4b6);
          this.rect(g, w * 0.64 + 32, f - 46, 9, 9, 0xf5e8ce);
          this.rect(g, 159, f - 71, 5, 71, 0x9f8d72);
          g.fillStyle(0xe6c88f);
          g.fillTriangle(140, f - 72, 181, f - 72, 160, f - 111);
          this.rect(g, 146, f - 5, 30, 5, 0x9f8d72);
          this.flowers(g, Math.min(period - 100, w * 0.64 + 225), f, 60);
        } else if (location === "park") {
          this.tree(g, 55, f, 0.8, [0xd9a3b3, 0xecc0cb, 0xe1b1bf]);
          this.flowers(g, 112, f, 95);
          this.flowers(g, Math.min(period - 150, w * 0.82), f, 100);
          const x = Math.max(240, w * 0.37);
          this.rect(g, x - 42, f - 28, 84, 24, 0xaabfba);
          this.rect(g, x - 33, f - 30, 66, 8, 0xa0c9cf);
          this.rect(g, x - 8, f - 68, 16, 40, 0xb9cdc4);
          this.rect(g, x - 29, f - 73, 58, 10, 0xc1d6cb);
          this.rect(g, x - 23, f - 73, 46, 4, 0xadd4d7);
          this.lamp(g, Math.min(period - 25, w + 100), f);
        } else if (location === "office") {
          this.bookshelf(g, 35, f, 76);
          const x = w * 0.62;
          this.rect(g, x - 159, 100, 91, 73, 0xb99f81);
          this.rect(g, x - 153, 106, 79, 61, 0xe5c9a1);
          for (let i = 0; i < 4; i++)
            this.rect(
              g,
              x - 145 + (i % 2) * 33,
              114 + Math.floor(i / 2) * 25,
              23,
              17,
              [0xe7b0a3, 0xc5d6c3, 0xeed8a6, 0xb5cbda][i],
            );
          this.rect(g, x + 200, f - 90, 35, 90, 0xaec5c1);
          this.rect(g, x + 207, f - 125, 21, 36, 0xb6d6d7);
          this.rect(g, x + 205, f - 68, 25, 21, 0xeaf0dc);
          this.rect(g, x + 210, f - 47, 5, 6, 0x829e9b);
          this.flowers(g, x + 248, f, 50);
        } else if (location === "beach") {
          const x = w * 0.74;
          this.rect(g, 52, f - 90, 9, 90, 0xb79e75);
          g.fillStyle(0x7eaa87);
          g.fillTriangle(55, f - 104, 12, f - 72, 55, f - 86);
          g.fillTriangle(55, f - 104, 99, f - 78, 55, f - 86);
          g.fillTriangle(55, f - 104, 27, f - 125, 55, f - 94);
          g.fillTriangle(55, f - 104, 88, f - 124, 55, f - 94);
          this.rect(g, 134, f - 27, 43, 27, 0x91babb);
          this.rect(g, 130, f - 31, 51, 8, 0xe4ddba);
          this.rect(g, 149, f - 37, 14, 6, 0xf4e9ce);
          g.fillStyle(0xe7b2a0);
          g.fillRoundedRect(x + 85, f - 91, 25, 90, 12);
          this.rect(g, x + 94, f - 75, 5, 60, 0xf8e9cb);
          for (let i = 0; i < 5; i++) {
            this.rect(
              g,
              212 + i * 80,
              f - 7,
              11,
              4,
              i % 2 ? 0xe3ac97 : 0xf8e5bc,
            );
            this.rect(
              g,
              215 + i * 80,
              f - 11,
              5,
              4,
              i % 2 ? 0xe3ac97 : 0xf8e5bc,
            );
          }
          this.rect(g, x + 135, f - 35, 37, 35, 0xc6a783);
          this.rect(g, x + 142, f - 50, 23, 15, 0xe8d7b3);
        } else if (location === "classroom") {
          this.bookshelf(g, 38, f, 87);
          this.wallArt(g, w * 0.57 - 103, 90, 68);
          this.rect(g, w * 0.57 + 210, f - 44, 42, 10, 0xb59b7d);
          this.rect(g, w * 0.57 + 215, f - 34, 6, 34, 0xa58a70);
          this.rect(g, w * 0.57 + 243, f - 34, 6, 34, 0xa58a70);
          this.rect(g, w * 0.57 + 215, f - 85, 34, 38, 0xc7ad88);
          this.flowers(g, Math.min(period - 90, w * 0.57 + 280), f, 60);
        }
      }
      house(g, x, floor, width = 145, height = 145, color = 0xead5b5) {
        this.rect(g, x + 7, floor - height + 7, width, height, 0x9eafb7);
        this.rect(g, x, floor - height, width, height, color);
        this.rect(g, x - 8, floor - height - 10, width + 16, 10, 0x647b8b);
        this.rect(g, x - 4, floor - height, width + 8, 5, 0x8b9eaa);
        this.rect(g, x + 19, floor - height + 25, 34, 47, 0xe0e8ed);
        this.rect(g, x + width - 53, floor - height + 25, 34, 47, 0xe0e8ed);
        this.rect(g, x + 26, floor - height + 25, 4, 47, 0x9baeb9);
        this.rect(g, x + width - 45, floor - height + 25, 4, 47, 0x9baeb9);
        this.rect(g, x + 16, floor - height + 72, 40, 5, 0x9baeb9);
        this.rect(g, x + width - 56, floor - height + 72, 40, 5, 0x9baeb9);
        this.rect(g, x, floor - 9, width, 9, 0x9faeb4);
        this.rect(g, x + width / 2 - 15, floor - 64, 30, 64, 0x6e879b);
        this.rect(g, x + width / 2 + 6, floor - 28, 4, 4, 0xf5dfa0);
      }
      build() {
        const w = this.scale.width,
          h = this.scale.height;
        this.width = w;
        this.height = h;
        // Leave a foreground strip for the floating game controls.
        this.floorY = Math.round(Math.min(h * 0.76, h - 168));
        this.background?.destroy(true);
        this.far?.destroy();
        this.middle?.destroy(true);
        this.ground?.destroy();
        for (const key of ["life-distant-scenery", "life-near-scenery"]) {
          if (this.textures.exists(key)) this.textures.remove(key);
        }
        this.clouds = [];
        this.background = this.add.container(0, 0).setDepth(0);
        const bg = this.add.graphics();
        const distant = this.add.graphics();
        this.background.add(bg);
        const location = locationFor(model);
        this.location = location;
        host.dataset.location = location;
        const indoor = ["home", "office", "classroom"].includes(location);
        const sky =
          location === "sunset"
            ? [0xbeb6d0, 0xdec7c6, 0xf4d4b4]
            : location === "beach"
              ? [0xd5e3eb, 0xdce8ed, 0xe8eef0]
              : [0xdde6ed, 0xe3e9ed, 0xe9eef1];
        if (indoor) {
          this.rect(
            bg,
            0,
            0,
            w,
            h,
            location === "classroom" ? 0xe8e2cd : 0xf0e6d3,
          );
          this.rect(bg, 0, h * 0.42, w, h * 0.4, 0xe5d9bf);
          for (let x = 0; x < 480; x += 240) {
            this.rect(distant, x + 20, h * 0.5, 150, 3, 0xd9ceb9);
            this.rect(distant, x + 20, h * 0.5, 3, h * 0.3, 0xd9ceb9);
          }
        } else {
          for (let i = 0; i < 3; i++)
            this.rect(
              bg,
              0,
              (i * this.floorY) / 3,
              w,
              this.floorY / 3 + 2,
              sky[i],
            );
          this.rect(
            bg,
            w * 0.83,
            36,
            39,
            39,
            location === "sunset" ? 0xf3bb86 : 0xffde94,
          );
          this.rect(
            bg,
            w * 0.83 - 7,
            43,
            53,
            25,
            location === "sunset" ? 0xf3bb86 : 0xffde94,
          );
          this.cloud(w * 0.66, this.floorY * 0.22, 0.85);
          this.cloud(w * 0.12, this.floorY * 0.46, 0.6);
          this.cloud(w * 0.94, this.floorY * 0.34, 0.5);
          for (let i = -1; i < 6; i++) {
            const x = i * 210;
            this.rect(
              distant,
              x,
              this.floorY - 135 + (i % 2) * 20,
              230,
              145,
              0xc5d0d8,
            );
            this.rect(
              distant,
              x + 30,
              this.floorY - 160 + (i % 2) * 20,
              110,
              25,
              0xc5d0d8,
            );
          }
        }
        if (location === "beach") {
          distant.clear();
          for (let x = 0; x < 420; x += 105) {
            this.rect(distant, x, this.floorY - 69, 55, 4, 0xe3f0dd);
            this.rect(distant, x + 35, this.floorY - 29, 45, 3, 0xc4dfd9);
          }
        }
        this.pixelTexture(
          distant,
          "life-distant-scenery",
          indoor ? 480 : 420,
          h,
        );
        distant.destroy();
        this.far = this.add
          .tileSprite(0, 0, w, h, "life-distant-scenery")
          .setOrigin(0)
          .setDepth(1);
        const g = this.add.graphics();
        const f = this.floorY;
        if (
          location === "street" ||
          location === "housing" ||
          location === "sunset"
        ) {
          for (let copy = -1; copy < 3; copy++) {
            const base = copy * (w + 280);
            this.tree(g, base + 70, f, 0.75);
            this.house(g, base + w * 0.62, f, 155, 154, 0xd7dce0);
            this.house(g, base + w * 0.62 + 185, f, 120, 204, 0xb6c7d1);
            this.tree(g, base + w + 140, f, 1);
            this.rect(g, base + w * 0.62 + 212, f - 179, 65, 90, 0xdcead7);
          }
        } else if (location === "home") {
          const x = w * 0.64;
          this.rect(g, x, 64, 145, 137, 0xb99674);
          this.rect(g, x + 7, 71, 131, 123, 0xbcdbdc);
          this.rect(g, x + 69, 71, 6, 123, 0xf8f0d9);
          this.rect(g, x + 7, 132, 131, 6, 0xf8f0d9);
          this.rect(g, x - 12, 62, 20, 151, 0xd79d84);
          this.rect(g, x + 139, 62, 20, 151, 0xd79d84);
          this.rect(g, x - 35, f - 59, 170, 49, 0x7da297);
          this.rect(g, x - 45, f - 71, 28, 62, 0x6f948a);
          this.rect(g, x + 123, f - 71, 27, 62, 0x6f948a);
          this.rect(g, x - 23, f - 93, 143, 45, 0x90b2a1);
          this.rect(g, x - 15, f - 80, 41, 30, 0xf8e2bd);
          this.rect(g, x + 37, f - 80, 41, 30, 0xe8c4ad);
          this.rect(g, x + 175, f - 38, 33, 38, 0xc1a385);
          this.tree(g, x + 191, f - 38, 0.35);
        } else if (location === "park") {
          this.tree(g, w * 0.66, f, 1.2);
          this.tree(g, w * 0.98, f, 0.85);
          this.rect(g, w * 0.57, f - 58, 130, 12, 0xb18c65);
          this.rect(g, w * 0.57, f - 39, 130, 12, 0xb18c65);
          this.rect(g, w * 0.58, f - 22, 125, 11, 0xc5a37c);
          this.rect(g, w * 0.6, f - 15, 8, 20, 0x6a7d69);
          this.rect(g, w * 0.76, f - 15, 8, 20, 0x6a7d69);
          for (let i = 0; i < 5; i++) {
            this.rect(g, w * 0.51 + i * 42, f - 10, 5, 10, 0x81a16c);
            this.rect(
              g,
              w * 0.51 + i * 42 - 3,
              f - 15,
              11,
              7,
              i % 2 ? 0xe3b672 : 0xd39a96,
            );
          }
        } else if (location === "office") {
          const x = w * 0.62;
          this.rect(g, x - 20, 56, 260, 135, 0xa5c9cd);
          for (let i = 0; i < 4; i++)
            this.rect(g, x - 12 + i * 65, 61, 4, 125, 0xf2eee0);
          this.rect(g, x - 35, f - 71, 206, 13, 0xad9174);
          this.rect(g, x - 22, f - 59, 9, 59, 0x927a65);
          this.rect(g, x + 145, f - 59, 9, 59, 0x927a65);
          this.rect(g, x + 8, f - 141, 83, 59, 0x4f7379);
          this.rect(g, x + 15, f - 134, 69, 44, 0xb1d6c9);
          this.rect(g, x + 43, f - 82, 11, 11, 0x6b8c85);
          this.rect(g, x + 28, f - 75, 42, 5, 0x6b8c85);
          this.rect(g, x - 75, f - 49, 32, 13, 0x869d87);
          this.rect(g, x - 72, f - 100, 27, 51, 0x789381);
          this.rect(g, x - 66, f - 36, 7, 36, 0x6e7e6d);
        } else if (location === "beach") {
          this.rect(bg, 0, f - 80, w, 88, 0x83b8c5);
          const x = w * 0.74;
          this.rect(g, x - 3, f - 135, 6, 135, 0xb19068);
          g.fillStyle(0xe0a18a);
          g.fillTriangle(x - 65, f - 132, x, f - 182, x + 65, f - 132);
          g.fillStyle(0xf4dec0);
          g.fillTriangle(x - 24, f - 132, x, f - 182, x + 24, f - 132);
          this.rect(g, x - 31, f - 16, 86, 7, 0xf1e4bf);
          this.rect(g, x - 28, f - 9, 5, 9, 0x997d60);
          this.rect(g, x + 42, f - 9, 5, 9, 0x997d60);
        } else if (location === "classroom") {
          const x = w * 0.57;
          this.rect(g, x, 65, 265, 143, 0xbca582);
          this.rect(g, x + 8, 73, 249, 127, 0x537f72);
          g.lineStyle(3, 0xdce7cb);
          g.strokeRect(x + 35, 98, 44, 42);
          g.lineBetween(x + 105, 107, x + 210, 107);
          g.lineBetween(x + 105, 124, x + 184, 124);
          g.lineBetween(x + 35, 165, x + 195, 165);
          this.rect(g, x + 28, f - 56, 170, 12, 0xc1a17a);
          this.rect(g, x + 43, f - 44, 9, 44, 0xa58c6e);
          this.rect(g, x + 176, f - 44, 9, 44, 0xa58c6e);
          this.rect(g, x + 75, f - 65, 44, 8, 0x7eaaa0);
          this.rect(g, x + 70, f - 72, 44, 7, 0xe2b487);
          this.rect(g, x + 77, f - 79, 44, 7, 0x9aabbc);
        }
        this.decorate(g, location, w, f);
        // Bake one complete scenery section and repeat it, including indoor props.
        // TileSprite wraps within the texture instead of jumping the whole container.
        this.pixelTexture(g, "life-near-scenery", w + 280, h);
        g.destroy();
        this.middle = this.add
          .tileSprite(0, 0, w, h, "life-near-scenery")
          .setOrigin(0)
          .setDepth(3);
        const key = "life-ground-" + location;
        if (!this.textures.exists(key)) {
          const textureHeight = indoor ? 72 : 1024;
          const tex = this.textures.createCanvas(key, 120, textureHeight),
            ctx = tex.context;
          ctx.fillStyle = indoor
            ? "#c5a782"
            : location === "beach"
              ? "#e5cd9e"
              : location === "park"
                ? "#c7b88d"
                : "#aeb8c1";
          ctx.fillRect(0, 0, 120, textureHeight);
          ctx.fillStyle = indoor ? "#b29776" : "#e4ddbc";
          ctx.fillRect(0, 0, 120, 6);
          ctx.fillRect(0, 35, 22, 3);
          ctx.fillRect(60, 63, 22, 3);
          if (indoor) {
            ctx.fillRect(0, 24, 120, 2);
            ctx.fillRect(0, 49, 120, 2);
            ctx.fillRect(58, 0, 2, 24);
            ctx.fillRect(22, 24, 2, 25);
          } else if (location !== "park" && location !== "beach") {
            ctx.fillStyle = "#aeb8c1";
            ctx.fillRect(0, 0, 120, textureHeight);
            ctx.fillStyle = "#e1e6e9";
            ctx.fillRect(0, 0, 120, 15);
            ctx.fillStyle = "#bfcbd3";
            ctx.fillRect(0, 15, 120, 3);
            for (let x = 0; x < 120; x += 30) ctx.fillRect(x, 0, 1, 15);
            ctx.fillStyle = "#e5e7dc";
            ctx.fillRect(16, 54, 32, 3);
          } else {
            ctx.fillStyle = location === "beach" ? "#e5cd9e" : "#bcbbaa";
            ctx.fillRect(0, 0, 120, textureHeight);
            ctx.fillStyle = location === "beach" ? "#eddbb9" : "#cdd0bd";
            for (let y = 14; y < textureHeight; y += 36) {
              for (let x = 6; x < 120; x += 37)
                ctx.fillRect((x + (y % 2) * 11) % 120, y, 5, 2);
            }
          }
          tex.refresh();
        }
        this.ground = this.add
          .tileSprite(0, f, w, h - f, key)
          .setOrigin(0)
          .setDepth(4);
        this.far.tilePositionX = this.walkDistance * 0.25;
        this.middle.tilePositionX = this.walkDistance;
        this.ground.tilePositionX = this.walkDistance;
        this.actor
          .setPosition(w * 0.32, f + 12)
          .setScale(1)
          .setDepth(8);
        this.actorShadow
          .clear()
          .fillStyle(0x627483, 0.35)
          .fillRect(Math.round(w * 0.32) - 17, f + 3, 34, 3);
      }
      applyState(state) {
        const previous = this.location,
          next = locationFor(state);
        if (previous !== next) {
          this.walkDistance = 0;
          this.build();
          if (!reducedMotion.matches)
            this.cameras.main.flash(260, 255, 249, 231);
        }
        if (state.moving && !reducedMotion.matches)
          this.actor.play("life-walk", true);
        else {
          this.actor.anims.stop();
          this.actor.setFrame(0);
          this.actor.y = this.floorY + 12;
          this.actor.angle = 0;
        }
      }
      update(time, delta) {
        this.frameCount++;
        if (
          document.hidden ||
          !document.getElementById("overlay")?.classList.contains("hidden")
        )
          return;
        if (reducedMotion.matches) return;
        const dt = Math.min(delta, 50) / 1000;
        for (const cloud of this.clouds) {
          cloud.object.x -= (cloud.speed + (model.moving ? 12 : 0)) * dt;
          if (cloud.object.x < -140) cloud.object.x = this.width + 100;
        }
        if (model.moving) {
          this.walkDistance += 100 * dt;
          // Props share the floor's speed; distant scenery scrolls more slowly.
          this.ground.tilePositionX = this.walkDistance;
          this.middle.tilePositionX = this.walkDistance;
          this.far.tilePositionX = this.walkDistance * 0.25;
          this.actor.y = this.floorY + 12 + Math.sin(time / 90) * 2;
          this.actor.angle = 0;
        }
      }
    }
    game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: host,
      width: host.clientWidth,
      height: host.clientHeight,
      backgroundColor: "#cfe2d8",
      pixelArt: true,
      roundPixels: true,
      render: { antialias: false },
      fps: { target: 60 },
      audio: { noAudio: true },
      scene: LifeScene,
      scale: { mode: Phaser.Scale.NONE },
    });
    observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (
        r.width &&
        r.height &&
        (game.scale.width !== Math.round(r.width) ||
          game.scale.height !== Math.round(r.height))
      )
        game.scale.resize(Math.round(r.width), Math.round(r.height));
    });
    observer.observe(host);
  }
  function sync(next) {
    model = { ...model, ...next };
    const location = locationFor(model);
    const label = document.getElementById("life-location-label");
    if (label) label.textContent = names[location];
    const host = document.getElementById("life-animation");
    if (host)
      host.setAttribute(
        "aria-label",
        names[location] +
          (model.moving
            ? " · 캐릭터가 걷고 있어요"
            : " · 캐릭터가 쉬고 있어요"),
      );
    if (currentScene) currentScene.applyState(model);
    if (!game && !pendingFrame)
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        ensure();
      });
  }
  function setVisible(visible) {
    if (!game) {
      if (visible) ensure();
      return;
    }
    if (visible) game.loop.wake();
    else game.loop.sleep();
  }
  function setMoving(moving) {
    model = { ...model, moving };
    currentScene?.applyState(model);
  }
  return {
    sync,
    setVisible,
    setMoving,
    snapshot: () => ({
      ready: Boolean(currentScene),
      location: currentScene?.location,
      moving: model.moving,
      frames: currentScene?.frameCount ?? 0,
      walkFrame: currentScene?.actor?.frame?.name ?? null,
      characterStyle: "pixel",
      groundOffset: currentScene?.ground?.tilePositionX ?? 0,
      sceneryOffset: currentScene?.middle?.tilePositionX ?? 0,
      backgroundOffset: currentScene?.far?.tilePositionX ?? 0,
      sceneryPeriod: currentScene ? currentScene.width + 280 : 0,
    }),
  };
})();
