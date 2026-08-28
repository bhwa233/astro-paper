# 音频素材出处

素材本身是可替换的：文件名不变即可，`src/Video.tsx` 里的 `BGM_VOLUME` / `TICK_VOLUME`
是按「峰值已经统一到 -3.5dB」这个前提定的，换素材要照同一口径重新做增益，否则那两个数字失去意义。

## bgm.mp3

- 原名：`mixkit-classical-7-714.mp3`
- 来源：Mixkit（https://mixkit.co/free-stock-music/）
- 许可：**Mixkit Free License，不是 CC0**。可免费商用、免署名，但该许可禁止
  「redistribute or make available the Item as a stand-alone file」。本仓库是公开的，
  提交一个未经修改的音频文件与这一条存在张力——这是选型时的已知取舍，
  记在这里以便日后要换有据可查。换回 CC0 素材的话，OpenGameArt 的
  `cc0-calm-relaxing-music` 合集是现成的来源。
- 原始文件：155.6s，256kbps
- 本仓库的处理：`volume=4.0dB` 静态增益（原始 max_volume 为 -7.5dB，抬到 -3.5dB 让
  `BGM_VOLUME` 这个常量有可预期的含义），再转 44.1kHz 立体声 128kbps mp3

  用静态增益而不是 `loudnorm`：loudnorm 是动态增益，会让同一段素材在不同片长下呈现
  不同的电平走向，试听时比较的就不再是曲子本身。

  **不裁短**。成片最长是封面 4s 加十张各 14s 上限，即 144s；155.6s 的原曲比它还长，
  因此任何一天的视频里 BGM 都放不到循环点。裁到刚好够用能省几百 KB，但代价是把
  「永不重复」变成「通常不重复」，而循环接缝正是最早那首 24.5s 素材被换掉的原因。

## tick.wav

- 原名：`rollover2.ogg`，出自 Kenney「UI Audio」资源包
- 作者：Kenney (kenney.nl)
- 来源：https://kenney.nl/assets/ui-audio
- 许可：CC0 1.0
- 本仓库的处理：`volume=-1.2dB` 静态增益 + 45ms 起 12ms 淡出（消掉尾部爆音），
  转 44.1kHz 立体声 wav

  保持 wav 而不转 mp3：这段只有 54ms，mp3 的编码器延时与尾部填充在这个长度上
  会明显推迟起音，而它要精确落在倒计时的整秒上。
