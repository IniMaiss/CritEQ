import AppKit

func createCritEQIcon(size: CGFloat) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    guard let ctx = NSGraphicsContext.current?.cgContext else {
        img.unlockFocus()
        return img
    }

    let scale = size / 1024.0

    // 1. Draw outer Neubrutalist drop shadow
    let shadowOffset = 36.0 * scale
    let rectMargin = 96.0 * scale
    let cornerRadius = 180.0 * scale
    let borderWidth = 28.0 * scale

    let shadowRect = CGRect(
        x: rectMargin + shadowOffset,
        y: rectMargin - shadowOffset,
        width: size - (rectMargin * 2),
        height: size - (rectMargin * 2)
    )
    let shadowPath = CGPath(roundedRect: shadowRect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)
    ctx.addPath(shadowPath)
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1.0))
    ctx.fillPath()

    // 2. Draw base card in Paper Cream Retro (#FAF7F2)
    let cardRect = CGRect(
        x: rectMargin,
        y: rectMargin,
        width: size - (rectMargin * 2),
        height: size - (rectMargin * 2)
    )
    let cardPath = CGPath(roundedRect: cardRect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)
    ctx.addPath(cardPath)
    ctx.setFillColor(CGColor(red: 250.0/255.0, green: 247.0/255.0, blue: 242.0/255.0, alpha: 1.0))
    ctx.fillPath()

    // 3. Card solid black border
    ctx.addPath(cardPath)
    ctx.setStrokeColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1.0))
    ctx.setLineWidth(borderWidth)
    ctx.strokePath()

    // 4. Equalizer faders inside card
    let faderXPositions = [280.0, 400.0, 520.0, 640.0, 760.0].map { $0 * scale }
    let thumbYFractions = [0.42, 0.65, 0.82, 0.58, 0.72]
    let faderColors = [
        CGColor(red: 253.0/255.0, green: 164.0/255.0, blue: 175.0/255.0, alpha: 1.0),  // Neo-Pink (#FDA4AF)
        CGColor(red: 103.0/255.0, green: 232.0/255.0, blue: 249.0/255.0, alpha: 1.0),  // Neo-Cyan (#67E8F9)
        CGColor(red: 134.0/255.0, green: 239.0/255.0, blue: 172.0/255.0, alpha: 1.0),  // Neo-Mint (#86EFAC)
        CGColor(red: 255.0/255.0, green: 222.0/255.0, blue: 89.0/255.0, alpha: 1.0),   // Neo-Yellow (#FFDE59)
        CGColor(red: 196.0/255.0, green: 181.0/255.0, blue: 253.0/255.0, alpha: 1.0)   // Neo-Purple (#C4B5FD)
    ]

    let trackYStart = 320.0 * scale
    let trackYEnd = 800.0 * scale
    let trackHeight = trackYEnd - trackYStart
    let trackWidth = 22.0 * scale
    let thumbWidth = 64.0 * scale
    let thumbHeight = 36.0 * scale

    for i in 0..<faderXPositions.count {
        let x = faderXPositions[i]
        let fraction = thumbYFractions[i]
        let color = faderColors[i]

        // Vertical track
        let trackRect = CGRect(x: x - trackWidth/2, y: trackYStart, width: trackWidth, height: trackHeight)
        let trackPath = CGPath(roundedRect: trackRect, cornerWidth: 6.0 * scale, cornerHeight: 6.0 * scale, transform: nil)
        ctx.addPath(trackPath)
        ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1.0))
        ctx.fillPath()

        // Slider thumb
        let thumbCenterY = trackYStart + (trackHeight * CGFloat(fraction))
        let thumbRect = CGRect(x: x - thumbWidth/2, y: thumbCenterY - thumbHeight/2, width: thumbWidth, height: thumbHeight)

        // Thumb shadow
        let thumbShadow = CGRect(x: thumbRect.origin.x + 6.0 * scale, y: thumbRect.origin.y - 6.0 * scale, width: thumbWidth, height: thumbHeight)
        let thumbShadowPath = CGPath(roundedRect: thumbShadow, cornerWidth: 8.0 * scale, cornerHeight: 8.0 * scale, transform: nil)
        ctx.addPath(thumbShadowPath)
        ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1.0))
        ctx.fillPath()

        // Thumb body
        let thumbPath = CGPath(roundedRect: thumbRect, cornerWidth: 8.0 * scale, cornerHeight: 8.0 * scale, transform: nil)
        ctx.addPath(thumbPath)
        ctx.setFillColor(color)
        ctx.fillPath()

        ctx.addPath(thumbPath)
        ctx.setStrokeColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1.0))
        ctx.setLineWidth(14.0 * scale)
        ctx.strokePath()

        // Thumb center groove
        ctx.setStrokeColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1.0))
        ctx.setLineWidth(8.0 * scale)
        ctx.strokeLineSegments(between: [
            CGPoint(x: x - 12.0 * scale, y: thumbCenterY),
            CGPoint(x: x + 12.0 * scale, y: thumbCenterY)
        ])
    }

    // 5. Draw bold Neubrutalist label: "CritEQ"
    let font = NSFont.systemFont(ofSize: 84.0 * scale, weight: .black)
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = .center

    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor.black,
        .paragraphStyle: paragraphStyle
    ]

    let text = "CritEQ" as NSString
    let textRect = CGRect(x: 0, y: 180.0 * scale, width: size, height: 110.0 * scale)
    text.draw(in: textRect, withAttributes: attrs)

    img.unlockFocus()
    return img
}

func savePNG(image: NSImage, path: String) {
    guard let tiffData = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiffData),
          let pngData = bitmap.representation(using: .png, properties: [:]) else {
        print("Failed to convert image to PNG")
        return
    }
    do {
        try pngData.write(to: URL(fileURLWithPath: path))
    } catch {
        print("Error saving PNG to \(path): \(error)")
    }
}

let iconsetDir = "build/AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: iconsetDir, withIntermediateDirectories: true, attributes: nil)

let sizes: [(String, CGFloat)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for (filename, s) in sizes {
    let img = createCritEQIcon(size: s)
    let outPath = "\(iconsetDir)/\(filename)"
    savePNG(image: img, path: outPath)
}

print("Iconset generated successfully at \(iconsetDir)")
