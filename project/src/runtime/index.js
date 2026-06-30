// 交付件浏览器运行时(deck-runtime)的入口。
// JAD-168 拆解目标:assets/template-swiss.html 内联的各 IIFE 将自底向上迁移到 src/runtime/*,
// 由 esbuild 打包成 assets/deck-runtime.js 注入模板(复用 imported-theme-runtime 的现成模式)。
// step 1:先把空 bundle 接入,window.__ ABI 基线应不变;模块在后续 step 2-8 逐步填充。
export {};
