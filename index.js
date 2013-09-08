var map, preSearch, heatmap, duration, curLat, curLong, curId,
	points = [],
	overlays = [],
	mapOptions = {
		zoom: 4,
		center: new google.maps.LatLng(37.09024, -95.712891),
		mapTypeId: google.maps.MapTypeId.SATELLITE
	};

$(document).ready(function() {
	function initialize() {
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(function(pos) {
				curLat = pos.coords.latitude;
				curLong = pos.coords.longitude;
				mapOptions.center = new google.maps.LatLng(curLat, curLong);	
			} , null);
		} 
		
		map = new google.maps.Map(document.getElementById('map-canvas'), mapOptions);

		songs = $.get('/allSongs', setPoints);
		service = new google.maps.places.PlacesService(map);

		$('#search').keydown(onSearch);

		$('#heatmap').click(function(e) {
			e.preventDefault();
			$('#songmap').removeClass('selected');
			$(this).addClass('selected');
			makeHeatmap();
		});

		$('#songmap').click(function(e) {
			e.preventDefault();
			$('#heatmap').removeClass('selected');
			$(this).addClass('selected');
			placePoints();
			return false;
		});

		if ($.cookie("session_id")) {
			initRdio();
		} else {
			$.get('/sessions', function(data) {
				$.cookie("session_id", data.session_key);
				initRdio();
			});
		}
		
		$('#searchField').keydown(onSearchSong);
		
		$('#api').bind('playingTrackChanged.rdio', function(e, playingTrack, sourcePosition) {
			if (playingTrack) {
				duration = playingTrack.duration;
				$('#left #albumArt').attr('src', playingTrack.icon);
				$('#left .titles .songTitle').text(playingTrack.name);
				$('#left .titles .artist').text(playingTrack.artist);
				$('#right #totalTime').text(prettyTime(duration));
			}
		});
		
		$('#api').bind('positionChanged.rdio', function(e, position) {
        	$('#durationBar').css('width', (100*position/duration)+'%');
			$('#right #currentTime').text(prettyTime(position));
      	});	
		
		$(document).on('click', '.result', function(e) {
			var id = $(this).attr('id');
			play(id);
			$('#search').toggle();
			postSong(id, curLat, curLong);
		});	

		$('#skip').click(function() {
			queueNextSong();
		});
		
		$('#play').click(function() {
			if ($('.icon-play').is(':visible')) {
				$('.icon-play').hide();
				$('.icon-pause').show();
				$('#api').rdio().play();
			} else {
				$('.icon-play').show();
				$('.icon-pause').hide();
				$('#api').rdio().pause();
			}
		});
		
		$('#favorite').click(function() {
			postSong(curId, curLat, curLong);
			$('#favorite i').removeClass('icon-star-empty');
			$('#favorite i').addClass('icon-star');
		});
		
		var socket = new WebSocket("ws://buffalohackers.com/ws");
		socket.onmessage = function(data) {
			var point = JSON.parse(data.data);
			points[points.length] = new google.maps.LatLng(point.lat, point.long);
			overlays[overlays.length] = new google.maps.Marker({
				position: points[points.length-1],
				map: map,
				icon: 'music_pin.png'
			});
		};		
	}

	google.maps.event.addDomListener(window, 'load', initialize);

	$("#searchOpen").click(function(){
		$("#search").toggle();
	});
	$("#closeButton").click(function(){
		$("#search").toggle();
	});
});

function onSearchSong(e) {
	if (e.which == 13) {
		var query = $('#searchField').val();
		
		$('.icon-spinner').show();
		$.get('/search?q=' + query, function(data) {
			$('.icon-spinner').hide();
			$('.searchResults').html('');
			var results = data.result.results;
			for (var i = 1;i < results.length && i < 6;i++) {
				$('.searchResults').append('<li id="' + results[i].key + '" class="result">' + 
					'<img class="albumArt" src="' + results[i].icon + '">' +
					'<div class="titles">' +
						'<h2 class="songTitle">' + results[i].name + '</h2>' +
						'<h3 class="artist">' + results[i].artist + '</h3>' +
					'</div></li>');	
			}
		});
	}
}

function initRdio() {
	if ($.cookie("playbackToken")) {
		$('#api').rdio($.cookie('playbackToken'));
		$('#api').bind('ready.rdio', function() {
			queueNextSong();
		});
	} else if ($.cookie("ats")) {
		$.get("/playbackToken", function(data) {
			$.cookie("playbackToken", data.result);
			initRdio();
		});
	} else {
		$.get('/login', function(data) {
			window.location.replace(data.see);
		});
	}
}	

function queueNextSong() {
	var session = $.cookie('session_id'),
		mapCenter = map.getCenter(),
		lat = mapCenter.lat(),
		lng = mapCenter.lng();	
	$.get('/songs?session_key=' + session + '&lat=' + lat + '&long=' + lng, function(data) {
		play(data.id, data.lat, data.long);
	});
}
		
function onSearch() {
	var resultsList = $('#results');
	resultsList.html('');

	if ($(this).val().length >= 2 && preSearch != $(this).val()) {								
		$.get('/map?input=' + $(this).val() + '&location=37.76999,-122.4469',
			function(data) {
				data = JSON.parse(data);
				var results = data.predictions,
					autocomp = [];
				for (var i = 0;i < results.length;i++) {
					autocomp.push(results[i].description);
				}
					
				$('#search').autocomplete({
					source: autocomp,
					select: function(event, ui) {
						var geocoder = new google.maps.Geocoder();

						geocoder.geocode({'address': ui.item.value}, function(addressResults, status) {
							if (status == google.maps.GeocoderStatus.OK) {
								var loc = addressResults[0].geometry.location;
								map.setZoom(10);
								map.panTo(new google.maps.LatLng(loc.ob, loc.pb));
							} else {
								console.log("Geocode was not successful for the following reason: " + status);
							}
						});
					}
				});
				
		});	
		preSearch = $(this).val();
	}
}

function setPoints(data) {
	points = [];
	for (var i = 0;i < data.length;i++) {
		points[i] = new google.maps.LatLng(data[i].lat, data[i].long);
	}
	placePoints();
}

function placePoints() {
	clearOverlays();
	for (var i = 0;i < points.length;i++) {
		overlays[i] = new google.maps.Marker({
			position: points[i],
			map: map,
			icon: 'music_pin.png'
		});
	}
}

function makeHeatmap() {
	clearOverlays();
	if (!heatmap) {
		var pointsArray = new google.maps.MVCArray(points);
		heatmap = new google.maps.visualization.HeatmapLayer({
			data: new google.maps.MVCArray(points)
		});
	}
	heatmap.setMap(map);
}

function clearOverlays() {
	while (overlays[0]) {
		overlays.pop().setMap(null);
	}
	if (heatmap && heatmap.getMap()) {
		heatmap.setMap(null);
	}	
}

function play(id, lat, lng) {
	$('#api').rdio().play(id);
	if (lat) {
		map.panTo(new google.maps.LatLng(lat, lng));
		map.setZoom(20);
	}
	curId = id;
}

function postSong(id, lat, lng) {
	$.post('/songs', JSON.stringify({
		session_key: $.cookie('session_id'),
		id: id,
		lat: lat,
		long: lng
	}), null, 'json');
}

function prettyTime(time) {
	var minutes = Math.floor(time/60);
	var seconds = Math.floor(time - minutes*60);
	seconds = seconds < 10 ? '0' + seconds : seconds;
	return minutes + ":" + seconds;
}
