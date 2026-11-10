// Our mascot: a round yellow face on a soft halo, drawn in SVG so it stays crisp at any size.
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { colors } from "./theme";

export default function Mascot({ size = 49 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Open Muse Bot">
      <Circle cx={50} cy={54} r={40} fill={colors.primarySoft} />
      <Circle cx={50} cy={50} r={33} fill={colors.primary} />
      <Ellipse cx={50} cy={84} rx={20} ry={3} fill="#000" opacity={0.06} />
      <Circle cx={39} cy={47} r={4.6} fill={colors.text} />
      <Circle cx={61} cy={47} r={4.6} fill={colors.text} />
      <Circle cx={40.5} cy={45.5} r={1.4} fill="#FFF" />
      <Circle cx={62.5} cy={45.5} r={1.4} fill="#FFF" />
      <Path d="M42 59 Q50 65 58 59" stroke={colors.text} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <Circle cx={31} cy={57} r={4} fill="#FF9F43" opacity={0.35} />
      <Circle cx={69} cy={57} r={4} fill="#FF9F43" opacity={0.35} />
    </Svg>
  );
}
