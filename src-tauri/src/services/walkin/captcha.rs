use image::{GrayImage, Luma};

/// Try to recognize text from a captcha image using basic image processing.
/// Returns the recognized text if successful, or None if the image is too noisy.
pub fn recognize_captcha(image_data: &[u8]) -> Option<String> {
    let img = image::load_from_memory(image_data).ok()?;
    let gray = img.to_luma8();

    // Step 1: Find the threshold using Otsu's method
    let threshold = otsu_threshold(&gray);

    // Step 2: Binarize
    let binary = binarize(&gray, threshold);

    // Step 3: Find connected components (dark pixels = text)
    let components = find_connected_components(&binary);

    // Step 4: Filter noise — keep components of reasonable size
    let min_size = (binary.width() * binary.height() / 200) as usize;
    let max_size = (binary.width() * binary.height() / 4) as usize;
    let mut chars: Vec<Component> = components
        .into_iter()
        .filter(|c| c.size >= min_size && c.size <= max_size)
        .collect();

    // Sort left to right
    chars.sort_by(|a, b| a.min_x.cmp(&b.min_x));

    // Step 5: If we have 3-7 components, try simple heuristic recognition
    if chars.len() < 3 || chars.len() > 7 {
        // Try lowering threshold for difficult captchas
        let low_threshold = (threshold as f64 * 0.7) as u8;
        let binary2 = binarize(&gray, low_threshold.max(60));
        let components2 = find_connected_components(&binary2);
        let chars2: Vec<Component> = components2
            .into_iter()
            .filter(|c| c.size >= min_size && c.size <= max_size)
            .collect();
        if chars2.len() >= 3 && chars2.len() <= 7 {
            // Order and try
            let mut sorted: Vec<Component> = chars2;
            sorted.sort_by(|a, b| a.min_x.cmp(&b.min_x));
            return try_recognize(&binary2, &sorted);
        }
        return None;
    }

    try_recognize(&binary, &chars)
}

struct Component {
    min_x: u32,
    max_x: u32,
    min_y: u32,
    max_y: u32,
    size: usize,
    black_pixels: usize,
}

fn otsu_threshold(img: &GrayImage) -> u8 {
    let mut histogram = [0u32; 256];
    let total = (img.width() * img.height()) as f64;

    for pixel in img.pixels() {
        histogram[pixel[0] as usize] += 1;
    }

    let mut best_threshold = 128u8;
    let mut best_variance = 0.0f64;

    for t in 1..255 {
        let w0: f64 = histogram[..t].iter().sum::<u32>() as f64 / total;
        let w1 = 1.0 - w0;
        if w0 == 0.0 || w1 == 0.0 {
            continue;
        }

        let sum0: f64 = histogram[..t]
            .iter()
            .enumerate()
            .map(|(i, &c)| i as f64 * c as f64)
            .sum();
        let sum1: f64 = histogram[t..]
            .iter()
            .enumerate()
            .map(|(i, &c)| (i + t) as f64 * c as f64)
            .sum();

        let mean0 = sum0 / (w0 * total);
        let mean1 = sum1 / (w1 * total);
        let variance = w0 * w1 * (mean0 - mean1).powi(2);

        if variance > best_variance {
            best_variance = variance;
            best_threshold = t as u8;
        }
    }

    best_threshold
}

fn binarize(img: &GrayImage, threshold: u8) -> GrayImage {
    let mut out = GrayImage::new(img.width(), img.height());
    for (x, y, pixel) in img.enumerate_pixels() {
        let val = if pixel[0] < threshold { 0u8 } else { 255u8 };
        out.put_pixel(x, y, Luma([val]));
    }
    out
}

fn find_connected_components(binary: &GrayImage) -> Vec<Component> {
    let (w, h) = (binary.width() as i32, binary.height() as i32);
    let mut visited = vec![false; (w * h) as usize];
    let mut components = Vec::new();

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if visited[idx] || binary.get_pixel(x as u32, y as u32)[0] > 127 {
                continue;
            }

            // Flood fill to find all connected dark pixels
            let mut size = 0usize;
            let mut black = 0usize;
            let (mut min_x, mut max_x) = (x, x);
            let (mut min_y, mut max_y) = (y, y);
            let mut stack = vec![(x, y)];
            visited[idx] = true;

            while let Some((cx, cy)) = stack.pop() {
                size += 1;
                if binary.get_pixel(cx as u32, cy as u32)[0] == 0 {
                    black += 1;
                }
                min_x = min_x.min(cx);
                max_x = max_x.max(cx);
                min_y = min_y.min(cy);
                max_y = max_y.max(cy);

                for (nx, ny) in &[
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                ] {
                    if *nx >= 0 && *nx < w && *ny >= 0 && *ny < h {
                        let nidx = (*ny * w + *nx) as usize;
                        if !visited[nidx] && binary.get_pixel(*nx as u32, *ny as u32)[0] < 128 {
                            visited[nidx] = true;
                            stack.push((*nx, *ny));
                        }
                    }
                }
            }

            if size > 2 {
                components.push(Component {
                    min_x: min_x as u32,
                    max_x: max_x as u32,
                    min_y: min_y as u32,
                    max_y: max_y as u32,
                    size,
                    black_pixels: black,
                });
            }
        }
    }

    components
}

fn try_recognize(binary: &GrayImage, chars: &[Component]) -> Option<String> {
    // For each component, extract the character image and try basic recognition
    let mut result = String::new();

    for comp in chars {
        let char_w = comp.max_x - comp.min_x + 1;
        let char_h = comp.max_y - comp.min_y + 1;

        // Skip components that are too wide or too tall (likely merged characters or noise)
        if char_w > binary.width() / 2 || char_h > binary.height() * 3 / 4 {
            continue;
        }
        if char_h < 4 {
            continue; // Too short, probably a dot or dash
        }

        // Extract character region
        let density = comp.black_pixels as f64 / comp.size as f64;
        let aspect = char_h as f64 / char_w as f64;

        // Simple heuristic-based recognition for common captcha characters
        match guess_char(char_w, char_h, density, aspect, binary, comp) {
            Some(c) => result.push(c),
            None => {
                // Couldn't recognize this character
                log::debug!(
                    "Unrecognized char: w={}, h={}, density={:.2}, aspect={:.2}",
                    char_w, char_h, density, aspect
                );
            }
        }
    }

    if result.len() >= 3 {
        Some(result.to_uppercase())
    } else {
        None
    }
}

fn guess_char(
    w: u32,
    h: u32,
    density: f64,
    aspect: f64,
    _binary: &GrayImage,
    _comp: &Component,
) -> Option<char> {
    // Crude heuristic based on character proportions
    // This won't be perfect but can handle simple monospace captchas

    let is_tall = aspect > 1.6;
    let is_wide = aspect < 0.7;
    let is_square = aspect >= 0.8 && aspect <= 1.3;
    let is_dense = density > 0.5;
    let is_sparse = density < 0.35;

    // Very wide — likely 'W', 'M', or merged chars
    if w as f64 > h as f64 * 1.5 && is_dense {
        return Some('W'); // Could be M or W
    }

    // Numbers tend to be narrower and denser
    if is_tall && is_dense {
        // Could be 1, I, l
        if w < h / 3 {
            return Some('1');
        }
        // Tall and moderate width — could be many things
    }

    if is_square && is_dense {
        // Square and dense — likely O, 0, 8, B
        if density > 0.6 {
            return Some('8');
        }
        return Some('0');
    }

    if is_square && is_sparse {
        return Some('C');
    }

    if is_wide && is_dense {
        return Some('M');
    }

    // Default: try to make a reasonable guess
    if w <= h / 3 {
        Some('1')
    } else if density > 0.45 {
        Some('8')
    } else {
        Some('5')
    }
}

/// Remove a single pixel-wide noise line from the image by checking isolated pixels
#[allow(dead_code)]
pub fn denoise(binary: &GrayImage) -> GrayImage {
    let mut out = binary.clone();
    let (w, h) = (binary.width() as i32, binary.height() as i32);

    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let is_black = out.get_pixel(x as u32, y as u32)[0] == 0;
            if !is_black {
                continue;
            }
            // Count black neighbors in 3x3 window
            let mut black_neighbors = 0;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    if out.get_pixel((x + dx) as u32, (y + dy) as u32)[0] == 0 {
                        black_neighbors += 1;
                    }
                }
            }
            // Isolated pixel — likely noise
            if black_neighbors <= 1 {
                out.put_pixel(x as u32, y as u32, Luma([255]));
            }
        }
    }

    out
}
