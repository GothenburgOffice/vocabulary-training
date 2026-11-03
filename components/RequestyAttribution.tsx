// Requesty's speech-bubble icon (vector, from requesty.ai), drawn in a 727 × 646 box. Its
// own colours read on both themes, so it isn't recoloured.
const BUBBLE =
  "M242.5,644.4C237.6,642.7 234.2,639.4 233.0,635.1C232.5,633.1 231.3,614.4 230.5,593.5C229.6,572.6 228.5,555.2 228.2,554.8C227.8,554.4 203.7,555.9 174.5,558.0C145.3,560.2 118.6,562.0 115.0,562.0C86.8,562.1 59.1,546.1 47.5,523.0C41.2,510.5 42.2,518.9 21.0,291.1C2.5,93.5 1.0,74.8 1.9,66.9C5.3,37.8 21.8,16.8 50.1,5.7C52.0,4.9 57.7,3.5 62.6,2.6L71.5,0.9L369.5,17.9C533.4,27.3 669.5,35.2 672.0,35.5C700.4,39.3 721.8,63.4 725.2,95.4C726.1,104.8 725.2,118.6 712.2,285.0C703.2,399.7 697.5,467.2 696.4,471.9C691.0,496.1 671.5,516.3 647.5,522.5C643.5,523.5 593.0,527.6 498.0,534.5L354.5,544.9L330.6,569.2C317.5,582.6 296.4,604.2 283.7,617.3C271.0,630.3 259.2,641.9 257.4,643.0C253.1,645.4 247.1,646.0 242.5,644.4Z";
const PROMPT =
  "M411.0,416.5C411.0,391.9 411.1,390.0 412.8,390.0C413.7,390.0 454.7,388.6 503.8,386.9C552.9,385.2 593.4,384.0 593.7,384.4C594.3,385.0 592.4,433.0 591.7,433.6C591.5,433.8 553.6,435.7 507.4,437.9C461.3,440.1 420.7,442.1 417.2,442.4L411.0,442.9L411.0,416.5ZM165.5,396.8C164.6,394.1 160.9,324.7 161.7,324.0C162.1,323.6 164.8,322.5 167.5,321.6C170.2,320.6 173.4,319.5 174.5,319.0C175.6,318.5 178.8,317.4 181.5,316.5C184.2,315.5 189.4,313.7 193.0,312.4C196.6,311.1 204.2,308.5 210.0,306.5C215.8,304.5 221.4,302.5 222.5,302.0C223.6,301.5 227.2,300.2 230.5,299.1C233.8,298.0 243.0,294.8 251.0,292.0C259.0,289.1 266.6,286.5 268.0,286.0C269.4,285.6 275.7,283.3 282.0,281.0C299.7,274.6 301.8,273.9 303.1,274.2C303.8,274.4 304.4,273.3 304.4,271.5C304.5,269.2 304.1,268.6 302.8,268.8C301.4,269.0 271.2,259.5 265.5,257.0C264.4,256.5 260.1,255.1 256.0,253.8C244.3,250.0 187.7,231.0 185.5,230.0C184.4,229.5 177.1,227.0 169.3,224.4L155.1,219.8L154.6,214.6C153.6,205.8 150.0,139.7 150.4,139.2C150.7,139.0 157.5,141.5 165.7,144.9C204.6,160.8 200.2,158.9 208.0,162.3C209.9,163.2 225.4,169.5 242.5,176.5C272.8,188.9 282.4,192.9 288.5,195.5C290.1,196.2 294.0,197.8 297.0,199.0C300.0,200.2 304.4,202.1 306.7,203.1C309.0,204.2 311.1,205.0 311.4,205.0C311.7,205.0 314.8,206.3 318.2,207.9C321.7,209.4 325.6,211.1 327.0,211.5C328.4,211.9 331.3,213.1 333.5,214.1C335.7,215.0 340.9,217.3 345.0,219.0C349.1,220.7 353.4,222.5 354.5,223.0C355.6,223.4 362.4,226.2 369.5,229.1C376.6,232.0 383.0,234.8 383.7,235.4C384.5,236.2 384.9,246.5 385.2,271.0L385.5,305.5L380.4,308.0C377.5,309.4 373.7,311.1 371.9,311.9C368.5,313.2 363.7,315.2 359.0,317.2C357.6,317.8 355.6,318.6 354.5,319.1C353.4,319.5 350.4,320.8 347.8,321.9C345.2,323.1 342.9,324.0 342.6,324.0C342.3,324.0 339.5,325.2 336.3,326.6C333.1,328.0 329.6,329.5 328.5,330.0C326.2,330.9 319.4,333.8 316.5,335.0C315.4,335.4 312.7,336.5 310.5,337.5C305.3,339.6 303.4,340.4 298.5,342.4C296.3,343.4 293.7,344.5 292.8,345.0C291.8,345.6 290.6,346.0 290.1,346.0C289.6,346.0 285.7,347.6 281.6,349.5C277.4,351.4 273.7,353.0 273.4,353.0C273.1,353.0 270.4,354.1 267.4,355.5C264.4,356.9 261.7,358.0 261.4,358.0C261.1,358.0 259.0,358.9 256.7,359.9C254.4,361.0 234.9,369.1 213.5,378.0C178.6,392.5 169.3,396.4 166.7,397.7C166.3,397.9 165.8,397.5 165.5,396.8Z";

// Shown at the bottom of the sidebar while an AI feature is on. The link can earn us credits,
// so it is marked as a referral where it is shown (marketing rules ask for paid links to be
// recognisable as such), not only in its label.
export default function RequestyAttribution() {
  return (
    <div className="requesty-attribution">
      <a
        className="requesty-link"
        href="https://app.requesty.ai/join?ref=b1f2b1e1"
        target="_blank"
        rel="sponsored noopener noreferrer"
        referrerPolicy="no-referrer"
        aria-label="AI features by Requesty. Referral link: signups may earn us AI credits. Opens in a new tab."
        title="Referral link: signups may earn us AI credits."
      >
        {/* Two short rows beside the logo, which spans both. */}
        <span className="requesty-text">
          <span>AI features by</span>
          <small>Referral link</small>
        </span>
        {/* Inline wordmark, laid out like requesty.ai's own: the icon, then "Requesty" in the
            system font at 18px bold. The text takes the theme's text colour, so it reads in
            light and dark mode; textLength keeps it inside the box whatever the font, and the
            whole mark scales down when the sidebar is narrow. No image request. */}
        <svg
          className="requesty-logo"
          viewBox="0 0 111 24"
          width="101"
          height="22"
          role="img"
          aria-label="Requesty"
        >
          <g transform="translate(0 2) scale(0.031)">
            <path d={BUBBLE} fill="#1677FF" />
            <path d={PROMPT} fill="#FFFFFF" />
          </g>
          <text
            x="30.5"
            y="18.5"
            textLength="80"
            lengthAdjust="spacingAndGlyphs"
            fill="currentColor"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="18"
            fontWeight="700"
          >
            Requesty
          </text>
        </svg>
      </a>
    </div>
  );
}
