import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePathParam = searchParams.get('path');

  if (!filePathParam) {
    return new NextResponse('Path parameter is required', { status: 400 });
  }

  // Prevent directory traversal attacks
  const normalizedPath = path.normalize(filePathParam).replace(/^(\.\.(\/|\\|$))+/, '');
  
  // Construct absolute path. We only allow accessing files within x_downloads.
  const absolutePath = path.join(process.cwd(), normalizedPath);
  const downloadsDir = path.join(process.cwd(), 'x_downloads');

  if (!absolutePath.startsWith(downloadsDir)) {
    return new NextResponse('Access denied', { status: 403 });
  }

  try {
    if (!fs.existsSync(absolutePath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const stat = fs.statSync(absolutePath);
    const fileStream = fs.createReadStream(absolutePath);
    
    // Determine content type (fallback to basic types if mime-types isn't used)
    const ext = path.extname(absolutePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.mp4') contentType = 'video/mp4';

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Length', stat.size.toString());
    // Cache heavily since these are downloaded static files
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    // Return as stream
    // @ts-ignore - Next.js NextResponse can accept readable stream
    return new NextResponse(fileStream, { headers });
  } catch (error) {
    console.error('Error serving local media:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
