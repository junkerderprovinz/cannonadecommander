<?php
/*
 * Same-origin proxy from the Unraid WebGUI to the CannonadeCommander host
 * supervisor's unix-socket API. Only whitelisted path+method pairs are
 * forwarded; nothing else reaches the engine, and the engine itself never
 * exposes Docker create/exec/build. The browser never touches the Docker socket.
 */
$sock  = getenv('CC_SOCK') ?: '/var/run/cannonadecommander.sock';
$allow = ['state' => ['GET'], 'plan' => ['GET', 'PUT'], 'apply' => ['POST']];

$path   = isset($_GET['path']) ? preg_replace('/[^a-z]/', '', $_GET['path']) : '';
$method = $_SERVER['REQUEST_METHOD'];

header('Content-Type: application/json');

if (!isset($allow[$path]) || !in_array($method, $allow[$path], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'not allowed']);
    exit;
}

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_UNIX_SOCKET_PATH => $sock,
    CURLOPT_URL            => 'http://localhost/api/' . $path,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 900,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
]);
if ($method === 'PUT' || $method === 'POST') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

$resp = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($resp === false || $code === 0) {
    http_response_code(502);
    echo json_encode(['error' => 'engine unreachable: ' . $err]);
    exit;
}
http_response_code($code ?: 200);
echo $resp;
