var map, preSearch, heatmap, duration, curLat, curLong, curId, curArtist, curSong, songLocation,
	points = [],
	overlays = [],
	mapOptions = {
		zoom: 4,
		center: new google.maps.LatLng(37.09024, -95.712891),
		mapTypeId: google.maps.MapTypeId.HYBRID
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

		$('#locationField').keydown(onSearch);

		$(document).on('click', '.locationResult', function(event) {
			var geocoder = new google.maps.Geocoder(),
				addr = $(this).html();

			$('#locationField').val('');
			$('#locationSearchResults').html('');
			geocoder.geocode({'address': addr}, function(addressResults, status) {
				if (status == google.maps.GeocoderStatus.OK) {
					var loc = addressResults[0].geometry.location;
					curLat = loc.ob;
					curLong = loc.pb;
					map.setZoom(15);
					map.panTo(new google.maps.LatLng(curLat, curLong));
					queueNextSong();
				} else {
					console.log("Geocode was not successful for the following reason: " + status);
				}
			});
		});

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
			if (duration - position < 1) {
				queueNextSong();
			}
      	});	
		
		$(document).on('click', '.result', function(e) {
			playSongFromInfoAndPost(this);
			$('#search').toggle();
		});	

		$(document).on('click', '.infoBox', function(e) {
			playSongFromInfo(this);
		});

		$('#skip').click(function() {
			for (i = 0; i <  overlays.length; i++) {
				if (overlays[i].getPosition().equals(songLocation)) {
					overlays[i].setIcon("music_pin.png")
				}
			}
			queueNextSong();
		});
		
		$('#play').click(function() {
			if ($('#bottom-playbar .icon-play').is(':visible')) {
				$('#bottom-playbar .icon-play').hide();
				$('.icon-pause').show();
				$('#api').rdio().play();
			} else {
				$('#bottom-playbar .icon-play').show();
				$('.icon-pause').hide();
				$('#api').rdio().pause();
			}
		});
		
		$('#favorite').click(function() {
			postSong(curId, curSong, curArtist, curLat, curLong, curUrl);
			$('#favorite i').removeClass('icon-star-empty');
			$('#favorite i').addClass('icon-star');
		});
		
		var socket = new WebSocket("ws://buffalohackers.com/ws");
		socket.onmessage = function(data) {
			var infowindow = new google.maps.InfoWindow();
			var point = JSON.parse(data.data);
			var songId = point["id"]
			points[points.length] = new google.maps.LatLng(point.lat, point.long);
			overlays[overlays.length] = new google.maps.Marker({
				position: points[points.length-1],
				map: map,
				icon: 'music_pin.png',
				animation: google.maps.Animation.DROP
			});
			makeInfoWindowEvent(map, infowindow, formatInfoBox(songId, point.song, point.artist, point.genre, point.url), overlays[overlays.length-1]);
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

function playSongFromInfoAndPost(htmlObject) {
	var id = $(htmlObject).attr('id');
	curSong = $(htmlObject).find(".songTitle").text();
	curArtist = $(htmlObject).find(".artist").text();
	curUrl = $(htmlObject).find(".albumArt").attr("src");
	play(id, curLat, curLong);
	postSong(id, curSong, curArtist, curLat, curLong, curUrl);
}

function playSongFromInfo(htmlObject) {
	var id = $(htmlObject).attr('id');
	curSong = $(htmlObject).find(".songTitle").text();
	curArtist = $(htmlObject).find(".artist").text();
	curUrl = $(htmlObject).find(".albumArt").attr("src");
	console.log(curLat, curLong);
	play(id, curLat, curLong);
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
	var resultsList = $('#locationSearchResults');
	resultsList.html('');

	if ($(this).val().length >= 2 && preSearch != $(this).val()) {								
		$.get('/map?input=' + $(this).val() + '&location=37.76999,-122.4469',
			function(data) {
				data = JSON.parse(data);
				console.log(data);
				var results = data.predictions;
				for (var i = 0;i < results.length;i++) {
					resultsList.append('<li class="locationResult">' + results[i].description + '</li>');
				}	
		});	
		preSearch = $(this).val();
	}
}

function setPoints(data) {
	points = [];
	for (var i = 0;i < data.length;i++) {
		points[i] = {
			"coordinates":new google.maps.LatLng(data[i].lat, data[i].long), 
			"artist": data[i].artist, 
			"song": data[i].song,
			"genre": data[i].genre,
			"id": data[i].id,
			"url": data[i].url
		}
	}
	placePoints();
}

function placePoints() {
	clearOverlays();
	var infowindow = new google.maps.InfoWindow();
	console.log(points);
	for (var i = 0;i < points.length;i++) {
		overlays[i] = new google.maps.Marker({
			position: points[i]["coordinates"],
			map: map,
			icon: 'music_pin.png'
		});
		console.log(points[i]["id"]);
		makeInfoWindowEvent(map, infowindow, formatInfoBox(points[i]["id"], points[i]["song"], points[i]["artist"], points[i]["genre"], points[i]["url"]), overlays[i]);
	}
}

function makeInfoWindowEvent(map, infowindow, contentString, marker) {
	google.maps.event.addListener(marker, 'click', function() {
		infowindow.setContent(contentString);
		infowindow.open(map, marker);
	});
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
	console.log(lat, lng);
	$('#api').rdio().play(id);
	songLocation = new google.maps.LatLng(lat, lng);
	if (lat) {
		map.panTo(songLocation);
		map.setZoom(20);
	}
	for (i = 0; i <  overlays.length; i++) {
		if (overlays[i].getPosition().equals(songLocation)) {
			console.log("in");
			overlays[i].setIcon("music_pin_active.png")
		}
	}
	curId = id;
}

function postSong(id, song, artist, lat, lng, url) {
	$.post('/songs', JSON.stringify({
		session_key: $.cookie('session_id'),
		id: id,
		lat: lat,
		long: lng,
		artist: artist,
		song: song,
		url: url
	}), null, 'json');
}

function prettyTime(time) {
	var minutes = Math.floor(time/60);
	var seconds = Math.floor(time - minutes*60);
	seconds = seconds < 10 ? '0' + seconds : seconds;
	return minutes + ":" + seconds;
}

function formatInfoBox(id, song, artist, genre, url) {
	return "<div class='infoBox' id='" + id + "'><div id='left'><img class='albumArt' src='" + url + "'><div class='infoSet'><h2 class='songTitle'>" + song + "</h2>" +
		   "<h3 class='artist'>" + artist + "</h3>" +
		   "<p>(" + genre + ")</p></div></div>" +
		   "<div id='right'><a class='infoPlay' id='" + id + "'><i class='icon-play'></i><br>Play Song</a></div></div>";
}
			
