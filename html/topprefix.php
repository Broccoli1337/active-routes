<?php
header('Content-Type: text/plain');

if(isset($_GET['topprefix'])) {
  $top = htmlspecialchars($_GET["topprefix"]);
}else{
  $top = 100;
}

#print($top);

$labels = "";
$result = file_get_contents('http://127.0.0.1:8008/bgp/topprefixes/127.0.0.1/json?maxPrefixes='. $top  .'&includeCovered=false&pruneCovered=true&direction=destination&minValue=100');
$obj = json_decode($result,true);
foreach ($obj as $row){
	unset($labels);
	foreach($row as $cell){
		$labels = 'prefix="'.$cell['prefix'].'",nexthop="'.$cell['nexthop'].'",aspath="'.$cell['aspath'].'",origin="'.$cell['origin'].'",communities="'.$cell['communities'].'",localpref="'.$cell['localpref'].'"';
		$name = "top_prefix";
		$val = $cell['value'] * 8; #conversion en bits
		print $name."{".$labels."} ".$val."\n";
	}
}
?>
