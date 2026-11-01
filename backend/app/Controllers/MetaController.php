<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;

class MetaController
{
    /**
     * Extracts rich OpenGraph / metadata for URL previews.
     */
    public function linkPreview(Request $request): void
    {
        $url = trim((string)($request->query('url') ?? ''));

        if (empty($url) || !preg_match('#^https?://#i', $url)) {
            JsonResponse::error('INVALID_URL', 'A valid HTTP or HTTPS URL is required.', 400);
            return;
        }

        $parsed = parse_url($url);
        if (!$parsed || empty($parsed['host'])) {
            JsonResponse::error('INVALID_URL', 'Invalid hostname provided.', 400);
            return;
        }

        $host = strtolower($parsed['host']);

        // Security / SSRF protection: block loopback and private networks
        if ($this->isPrivateHost($host)) {
            JsonResponse::error('FORBIDDEN_HOST', 'Internal network addresses are forbidden.', 403);
            return;
        }

        $domain = preg_replace('#^www\.#i', '', $host);
        $fallbackFavicon = 'https://www.google.com/s2/favicons?domain=' . urlencode($domain) . '&sz=64';

        // Check for YouTube direct metadata
        $youtubeId = $this->extractYoutubeId($url);
        $defaultImage = $youtubeId ? "https://img.youtube.com/vi/{$youtubeId}/hqdefault.jpg" : null;
        $defaultTitle = $this->guessSiteTitle($domain, $parsed['path'] ?? '');

        // Fetch HTML head snippet
        $html = $this->fetchUrlHead($url);

        $title = null;
        $description = null;
        $image = $defaultImage;
        $siteName = null;

        if ($html !== null && strlen($html) > 0) {
            // Extract OpenGraph tags
            if (preg_match('#<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $m)) {
                $title = html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            } elseif (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) {
                $title = html_entity_decode(trim(strip_tags($m[1])), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }

            if (preg_match('#<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $m)) {
                $description = html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            } elseif (preg_match('#<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $m)) {
                $description = html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }

            if (empty($image) && preg_match('#<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $m)) {
                $imgUrl = trim($m[1]);
                if (preg_match('#^https?://#i', $imgUrl)) {
                    $image = $imgUrl;
                } elseif (preg_match('#^//#', $imgUrl)) {
                    $image = 'https:' . $imgUrl;
                } else {
                    $image = rtrim($parsed['scheme'] . '://' . $parsed['host'], '/') . '/' . ltrim($imgUrl, '/');
                }
            }

            if (preg_match('#<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $m)) {
                $siteName = html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        // Final Fallbacks
        $cleanTitle = $title ?: $defaultTitle;
        $cleanSiteName = $siteName ?: ucfirst($domain);

        JsonResponse::success([
            'preview' => [
                'url' => $url,
                'domain' => $domain,
                'title' => $cleanTitle,
                'description' => $description ?: ('Visit ' . $domain . ' to read more.'),
                'image' => $image,
                'site_name' => $cleanSiteName,
                'favicon' => $fallbackFavicon,
            ]
        ], 'Link preview retrieved.');
    }

    private function isPrivateHost(string $host): bool
    {
        if (in_array($host, ['localhost', '127.0.0.1', '::1', '0.0.0.0'], true)) {
            return true;
        }

        $ip = gethostbyname($host);
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return !filter_var(
                $ip,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            );
        }

        return false;
    }

    private function fetchUrlHead(string $url): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 UgnayraBot/1.0',
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Range: bytes=0-45000',
            ],
        ]);

        $content = curl_exec($ch);
        // curl_close is a no-op in modern PHP, omit to prevent 8.5+ deprecation notice
        return is_string($content) ? $content : null;
    }

    private function extractYoutubeId(string $url): ?string
    {
        if (preg_match('#(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|v/|shorts/))([a-zA-Z0-9_-]{11})#i', $url, $m)) {
            return $m[1];
        }
        return null;
    }

    private function guessSiteTitle(string $domain, string $path): string
    {
        $domainMap = [
            'youtube.com' => 'YouTube',
            'youtu.be' => 'YouTube',
            'chatgpt.com' => 'ChatGPT: Get instant answers & ideas',
            'openai.com' => 'OpenAI',
            'github.com' => 'GitHub: Where the world builds software',
            'google.com' => 'Google Search',
            'wikipedia.org' => 'Wikipedia, the free encyclopedia',
            'facebook.com' => 'Facebook',
            'twitter.com' => 'X (formerly Twitter)',
            'x.com' => 'X',
            'instagram.com' => 'Instagram',
            'linkedin.com' => 'LinkedIn',
            'bulsu.edu.ph' => 'Bulacan State University',
            'vercel.app' => 'Vercel Deployment',
        ];

        if (isset($domainMap[$domain])) {
            return $domainMap[$domain];
        }

        return ucfirst($domain);
    }
}
