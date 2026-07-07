<?php
/*
 * Same-origin proxy from the Unraid WebGUI to the CannonadeCommander host
 * supervisor's unix-socket API. Only whitelisted path+method pairs are
 * forwarded; nothing else reaches the engine, and the engine itself never
 * exposes Docker create/exec/build. The browser never touches the Docker socket.
 */
$sock  = getenv('CC_SOCK') ?: '/var/run/cannonadecommander.sock';
// state/stats: read-only; action: start|stop|restart|pause|unpause (the engine
// validates the container name against the live list and never exposes
// create/exec/build); plan/apply: the start-order plan. Nothing else is forwarded.
$allow = ['state' => ['GET'], 'stats' => ['GET'], 'action' => ['POST'], 'limits' => ['GET', 'POST'], 'limitlog' => ['GET'], 'plan' => ['GET', 'PUT'], 'apply' => ['POST'], 'config' => ['GET', 'PUT']];

$path   = isset($_GET['path']) ? preg_replace('/[^a-z]/', '', $_GET['path']) : '';
$method = $_SERVER['REQUEST_METHOD'];

header('Content-Type: application/json');

if (!isset($allow[$path]) || !in_array($method, $allow[$path], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'not allowed']);
    exit;
}

// Forward only the query params each path explicitly needs (allowlist, like
// $allow) so no attacker-supplied param ever reaches the engine unfiltered.
$qallow = ['limits' => ['name']];
$extra = [];
if (isset($qallow[$path])) {
    foreach ($qallow[$path] as $k) {
        if (isset($_GET[$k])) {
            $extra[$k] = $_GET[$k];
        }
    }
}
$qs = http_build_query($extra);

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_UNIX_SOCKET_PATH => $sock,
    CURLOPT_URL            => 'http://localhost/api/' . $path . ($qs ? '?' . $qs : ''),
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
