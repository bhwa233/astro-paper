# 音频素材出处

两个文件都是 CC0 1.0 Universal（公共领域贡献），CC0 明确允许再分发，因此可以随仓库公开。
选 CC0 而不是 Pixabay/Mixkit：那两家的许可禁止「standalone redistribution」，把未经修改的音频
提交进公开仓库正好踩在这条上。

素材本身是可替换的：换文件名不变即可，`src/audio.ts` 里只有音量常量需要重新校准。

## bgm.mp3

- 原名：Ambient Relaxing Loop
- 作者：isaiah658
- 来源：https://opengameart.org/content/ambient-relaxing-loop
- 许可：CC0 1.0（页面原话：No attribution required）
- 原始文件：`Ambient-Loop-isaiah658_0.ogg`，24.5s 无缝循环
- 本仓库的处理：`volume=3.4dB` 静态增益（原始 max_volume 为 -6.4dB，抬到 -3.5dB 让
  `BGM_VOLUME` 这个常量有可预期的含义），再转 44.1kHz 立体声 128kbps mp3

  用静态增益而不是 `loudnorm`：loudnorm 是动态增益，会在循环接缝处留下电平跳变，
  而这段素材整段循环播放两分钟。

## tick.wav

- 原名：`rollover2.ogg`，出自 Kenney「UI Audio」资源包
- 作者：Kenney (kenney.nl)
- 来源：https://kenney.nl/assets/ui-audio
- 许可：CC0 1.0
- 本仓库的处理：`volume=-1.2dB` 静态增益 + 45ms 起 12ms 淡出（消掉尾部爆音），
  转 44.1kHz 立体声 wav

  保持 wav 而不转 mp3：这段只有 54ms，mp3 的编码器延时与尾部填充在这个长度上
  会明显推迟起音，而它要精确落在倒计时的整秒上。
