package files

import (
	"bytes"
	"encoding/binary"
	"errors"
)

// Фото с телефона несут EXIF: модель камеры, время и, главное, GPS-координаты.
// Файлы публичные, поэтому метаданные вырезаются до сохранения. Пиксели не
// перекодируются: качество остаётся прежним, а ориентация из EXIF переносится
// в минимальный EXIF-блок, иначе снятое вертикально фото легло бы на бок.

var errMalformed = errors.New("malformed image")

type jpegSegment struct {
	marker byte
	raw    []byte // the whole segment including the marker
}

// jpegSegments splits a JPEG into header segments up to the start of scan and
// returns the rest (scan data up to EOI) untouched.
func jpegSegments(data []byte) ([]jpegSegment, []byte, error) {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return nil, nil, errMalformed
	}
	var segs []jpegSegment
	i := 2
	for {
		for i+1 < len(data) && data[i] == 0xFF && data[i+1] == 0xFF {
			i++ // fill bytes
		}
		if i+1 >= len(data) || data[i] != 0xFF {
			return nil, nil, errMalformed
		}
		marker := data[i+1]
		if marker == 0xDA || marker == 0xD9 { // start of scan or a header-only file
			return segs, data[i:], nil
		}
		if marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7) {
			segs = append(segs, jpegSegment{marker, data[i : i+2]})
			i += 2
			continue
		}
		if i+4 > len(data) {
			return nil, nil, errMalformed
		}
		end := i + 2 + int(binary.BigEndian.Uint16(data[i+2:i+4]))
		if end < i+4 || end > len(data) {
			return nil, nil, errMalformed
		}
		segs = append(segs, jpegSegment{marker, data[i:end]})
		i = end
	}
}

// stripJPEG drops APP1 (EXIF, XMP), other APPn blocks and comments, keeps
// JFIF, the ICC profile and the Adobe marker, and returns the EXIF orientation
// (1 when unknown).
func stripJPEG(data []byte) ([]byte, int, error) {
	segs, rest, err := jpegSegments(data)
	if err != nil {
		return nil, 0, err
	}
	orientation := 1
	kept := make([]jpegSegment, 0, len(segs))
	for _, s := range segs {
		payload := s.raw[min(4, len(s.raw)):]
		switch {
		case s.marker == 0xE1:
			if bytes.HasPrefix(payload, []byte("Exif\x00\x00")) {
				if o := exifOrientation(payload[6:]); o != 0 {
					orientation = o
				}
			}
		case s.marker == 0xE2:
			if bytes.HasPrefix(payload, []byte("ICC_PROFILE\x00")) {
				kept = append(kept, s)
			}
		case s.marker == 0xE0, s.marker == 0xEE: // JFIF; Adobe нужен для цветов CMYK/YCCK
			kept = append(kept, s)
		case s.marker >= 0xE3 && s.marker <= 0xEF, s.marker == 0xFE:
		default:
			kept = append(kept, s)
		}
	}
	out := bytes.NewBuffer(make([]byte, 0, len(data)))
	out.Write(data[:2])
	// EXIF с ориентацией идёт сразу после JFIF, а если его нет — сразу после SOI.
	if len(kept) > 0 && kept[0].marker == 0xE0 {
		out.Write(kept[0].raw)
		kept = kept[1:]
	}
	if orientation != 1 {
		out.Write(orientationSegment(orientation))
	}
	for _, s := range kept {
		out.Write(s.raw)
	}
	out.Write(rest)
	return out.Bytes(), orientation, nil
}

// exifOrientation reads tag 0x0112 from IFD0 of a TIFF structure; 0 if absent.
func exifOrientation(tiff []byte) int {
	if len(tiff) < 8 {
		return 0
	}
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 0
	}
	ifd := int(order.Uint32(tiff[4:8]))
	if ifd < 8 || ifd+2 > len(tiff) {
		return 0
	}
	n := int(order.Uint16(tiff[ifd : ifd+2]))
	for k := 0; k < n; k++ {
		e := ifd + 2 + k*12
		if e+12 > len(tiff) {
			return 0
		}
		if order.Uint16(tiff[e:e+2]) != 0x0112 {
			continue
		}
		if order.Uint16(tiff[e+2:e+4]) != 3 { // SHORT
			return 0
		}
		v := int(order.Uint16(tiff[e+8 : e+10]))
		if v >= 1 && v <= 8 {
			return v
		}
		return 0
	}
	return 0
}

// orientationSegment builds an APP1 EXIF segment holding only the orientation.
func orientationSegment(o int) []byte {
	tiff := []byte{
		'M', 'M', 0x00, 0x2A, 0, 0, 0, 8, // big-endian header, IFD0 at offset 8
		0, 1, // one entry
		0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, byte(o), 0, 0, // orientation, SHORT, count 1
		0, 0, 0, 0, // no next IFD
	}
	payload := append([]byte("Exif\x00\x00"), tiff...)
	seg := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(seg[2:], uint16(len(payload)+2))
	return append(seg, payload...)
}

// stripPNG drops text chunks, eXIf and tIME; everything that affects pixels stays.
func stripPNG(data []byte) ([]byte, error) {
	const sig = "\x89PNG\r\n\x1a\n"
	if len(data) < len(sig) || string(data[:len(sig)]) != sig {
		return nil, errMalformed
	}
	out := bytes.NewBuffer(make([]byte, 0, len(data)))
	out.WriteString(sig)
	i := len(sig)
	for i < len(data) {
		if i+8 > len(data) {
			return nil, errMalformed
		}
		length := int(binary.BigEndian.Uint32(data[i : i+4]))
		end := i + 12 + length
		if length < 0 || end > len(data) {
			return nil, errMalformed
		}
		switch string(data[i+4 : i+8]) {
		case "tEXt", "zTXt", "iTXt", "eXIf", "tIME":
		default:
			out.Write(data[i:end])
		}
		if string(data[i+4:i+8]) == "IEND" {
			return out.Bytes(), nil
		}
		i = end
	}
	return nil, errMalformed
}

// stripWebP drops EXIF and XMP chunks and clears their flags in VP8X.
func stripWebP(data []byte) ([]byte, error) {
	if len(data) < 12 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return nil, errMalformed
	}
	out := bytes.NewBuffer(make([]byte, 0, len(data)))
	out.Write(data[:12])
	i := 12
	for i < len(data) {
		if i+8 > len(data) {
			return nil, errMalformed
		}
		size := int(binary.LittleEndian.Uint32(data[i+4 : i+8]))
		end := i + 8 + size + size%2 // chunks are padded to an even size
		if end > len(data) {
			if i+8+size == len(data) { // tolerate a missing final pad byte
				end = len(data)
			} else {
				return nil, errMalformed
			}
		}
		switch string(data[i : i+4]) {
		case "EXIF", "XMP ":
		case "VP8X":
			chunk := append([]byte(nil), data[i:end]...)
			if len(chunk) > 8 {
				chunk[8] &^= 0x08 | 0x04 // EXIF and XMP flags
			}
			out.Write(chunk)
		default:
			out.Write(data[i:end])
		}
		i = end
	}
	b := out.Bytes()
	binary.LittleEndian.PutUint32(b[4:8], uint32(len(b)-8))
	return b, nil
}
