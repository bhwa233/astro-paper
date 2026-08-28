import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
// 全片是静态文字卡，CRF 再低也只是把噪点编码得更贵。
Config.setCrf(23);
